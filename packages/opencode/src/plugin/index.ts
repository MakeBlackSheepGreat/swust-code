import { LayerNode } from "@swust-code/core/effect/layer-node"
import type {
  ActorMatcher,
  ActorPostStopInput,
  ActorPreStopInput,
  ActorStopOutput,
  Hooks,
  PluginInput,
  Plugin as PluginInstance,
  PluginModule,
  WorkspaceAdapter as PluginWorkspaceAdapter,
} from "@swust-code/plugin"
import { Config } from "@/config/config"
import { createOpencodeClient } from "@swust-code/sdk"
import { ServerAuth } from "@/server/auth"
import { CodexAuthPlugin } from "./openai/codex"
import { Session } from "@/session/session"
import { NamedError } from "@swust-code/core/util/error"
import { CopilotAuthPlugin } from "./github-copilot/copilot"
import { CloudflareAIGatewayAuthPlugin, CloudflareWorkersAuthPlugin } from "./cloudflare"
import { AzureAuthPlugin } from "./azure"
import { DigitalOceanAuthPlugin } from "./digitalocean"
import { XaiAuthPlugin } from "./xai"
import { CheckpointSplitoverPlugin } from "./checkpoint-splitover"
import { SubagentProgressCheckerPlugin } from "./subagent-progress-checker"
import { Context, Effect, Layer, Schema } from "effect"
import { EventV2 } from "@swust-code/core/event"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { errorMessage } from "@/util/error"
import { PluginLoader } from "./loader"
import { parsePluginSpecifier, readPluginId, readV1Plugin, resolvePluginId } from "./shared"
import { registerAdapter } from "@/control-plane/adapters"
import type { WorkspaceAdapter } from "@/control-plane/types"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstallationChannel } from "@swust-code/core/installation/version"
import { matchesActor } from "./matcher"
import { SessionID } from "@/session/schema"

export const HookEvent = {
  Executed: EventV2.define({
    type: "hook.executed",
    schema: {
      event: Schema.Literals(["actor.preStop", "actor.postStop"]),
      hookID: Schema.String,
      pluginName: Schema.String,
      actorID: Schema.String,
      agentType: Schema.String,
      durationMs: Schema.Number,
      outcome: Schema.Literals(["success", "error", "skipped"]),
      continueRequested: Schema.Boolean,
      reasonLength: Schema.Number,
    },
  }),
  ReActReentered: EventV2.define({
    type: "hook.react.reentered",
    schema: {
      phase: Schema.Literals(["pre", "post"]),
      actorID: Schema.String,
      agentType: Schema.String,
      iteration: Schema.Number,
      triggeredByPlugins: Schema.Array(Schema.String),
      reasonPreview: Schema.String,
    },
  }),
  ReActMaxReached: EventV2.define({
    type: "hook.react.max_reached",
    schema: {
      phase: Schema.Literals(["pre", "post"]),
      actorID: Schema.String,
      agentType: Schema.String,
    },
  }),
} as const

type HookEntry = {
  hook: Hooks
  pluginName: string
  hookIDFor: (eventName: string) => string
}

type State = {
  hooks: Hooks[]
  hooksWithMeta: HookEntry[]
}

export type ActorStopAggregatedDecision = ActorStopOutput & {
  contributingPluginNames: string[]
  contributingHookIDs: string[]
}

// Hook names that follow the (input, output) => Promise<void> trigger pattern
type TriggerName = {
  [K in keyof Hooks]-?: NonNullable<Hooks[K]> extends (input: any, output: any) => Promise<void> ? K : never
}[keyof Hooks]

export interface Interface {
  readonly trigger: <
    Name extends TriggerName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(
    name: Name,
    input: Input,
    output: Output,
  ) => Effect.Effect<Output>
  readonly list: () => Effect.Effect<Hooks[]>
  readonly init: () => Effect.Effect<void>
  readonly triggerActorPreStop: (
    input: ActorPreStopInput,
  ) => Effect.Effect<ActorStopAggregatedDecision>
  readonly triggerActorPostStop: (
    input: ActorPostStopInput,
  ) => Effect.Effect<ActorStopAggregatedDecision>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Plugin") {}

export function experimentalWebSocketsEnabled(input: { enabled: boolean; channel?: string }) {
  return input.enabled || ["local", "dev", "beta"].includes(input.channel ?? InstallationChannel)
}

// Built-in plugins that are directly imported (not installed from npm)
function internalPlugins(flags: RuntimeFlags.Info): PluginInstance[] {
  return [
    // Temporary rollout: pre-release builds use WebSockets by default; releases require explicit opt-in.
    (input) =>
      CodexAuthPlugin(input, {
        experimentalWebSockets: experimentalWebSocketsEnabled({ enabled: flags.experimentalWebSockets }),
      }),
    CopilotAuthPlugin,
    CloudflareWorkersAuthPlugin,
    CloudflareAIGatewayAuthPlugin,
    AzureAuthPlugin,
    DigitalOceanAuthPlugin,
    XaiAuthPlugin,
    CheckpointSplitoverPlugin,
    SubagentProgressCheckerPlugin,
  ]
}

function isServerPlugin(value: unknown): value is PluginInstance {
  return typeof value === "function"
}

function getServerPlugin(value: unknown) {
  if (isServerPlugin(value)) return value
  if (!value || typeof value !== "object" || !("server" in value)) return
  if (!isServerPlugin(value.server)) return
  return value.server
}

function getLegacyPlugins(mod: Record<string, unknown>) {
  const seen = new Set<unknown>()
  const result: PluginInstance[] = []

  for (const entry of Object.values(mod)) {
    if (seen.has(entry)) continue
    seen.add(entry)
    const plugin = getServerPlugin(entry)
    if (!plugin) throw new TypeError("Plugin export is not a function")
    result.push(plugin)
  }

  return result
}

async function applyPlugin(
  load: PluginLoader.Loaded,
  input: PluginInput,
  hooks: Hooks[],
  hooksWithMeta: HookEntry[],
) {
  const plugin = readV1Plugin(load.mod, load.spec, "server", "detect")
  if (plugin) {
    await resolvePluginId(load.source, load.spec, load.target, readPluginId(plugin.id, load.spec), load.pkg)
    const pluginName = readPluginId(plugin.id, load.spec) ?? load.pkg?.pkg ?? load.spec
    const hookObj = await (plugin as PluginModule).server(input, load.options)
    hooks.push(hookObj)
    hooksWithMeta.push({
      hook: hookObj,
      pluginName,
      hookIDFor: (event: string) => `${pluginName}#${event}`,
    })
    return
  }

  for (const server of getLegacyPlugins(load.mod)) {
    const fnName = (server as { name?: string }).name
    const pluginName = fnName && fnName !== "default" && fnName !== "" ? fnName : (load.pkg?.pkg ?? load.spec)
    const hookObj = await server(input, load.options)
    hooks.push(hookObj)
    hooksWithMeta.push({
      hook: hookObj,
      pluginName,
      hookIDFor: (event: string) => `${pluginName}#${event}`,
    })
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Plugin.state")(function* (ctx) {
        const hooks: Hooks[] = []
        const hooksWithMeta: HookEntry[] = []
        const bridge = yield* EffectBridge.make()

        function publishPluginError(message: string) {
          bridge.fork(events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() }))
        }

        const { Server } = yield* Effect.promise(() => import("../server/server"))

        const client = createOpencodeClient({
          baseUrl: "http://localhost:4096",
          directory: ctx.directory,
          headers: ServerAuth.headers(),
          fetch: async (...args) => Server.Default().app.fetch(...args),
        })
        const cfg = yield* config.get()
        const input: PluginInput = {
          client,
          project: ctx.project,
          worktree: ctx.worktree,
          directory: ctx.directory,
          experimental_workspace: {
            register(type: string, adapter: PluginWorkspaceAdapter) {
              registerAdapter(ctx.project.id, type, adapter as WorkspaceAdapter)
            },
          },
          get serverUrl(): URL {
            return Server.url ?? new URL("http://localhost:4096")
          },
          // @ts-expect-error
          $: typeof Bun === "undefined" ? undefined : Bun.$,
        }

        for (const plugin of flags.disableDefaultPlugins ? [] : internalPlugins(flags)) {
          const init = yield* Effect.tryPromise({
            try: () => plugin(input),
            catch: errorMessage,
          }).pipe(
            Effect.tapError((error) => Effect.logError("failed to load internal plugin", { name: plugin.name, error })),
            Effect.option,
          )
          if (init._tag === "Some") {
            hooks.push(init.value)
            hooksWithMeta.push({
              hook: init.value,
              pluginName: plugin.name,
              hookIDFor: (event: string) => `${plugin.name}#${event}`,
            })
          }
        }

        const plugins = flags.pure ? [] : (cfg.plugin_origins ?? [])
        if (flags.pure && cfg.plugin_origins?.length) {
        }
        if (plugins.length) yield* config.waitForDependencies()

        const loaded = yield* Effect.promise(() =>
          PluginLoader.loadExternal({
            items: plugins,
            kind: "server",
            report: {
              start(candidate) {},
              missing(candidate, _retry, message) {},
              error(candidate, _retry, stage, error, resolved) {
                const spec = candidate.plan.spec
                const cause = error instanceof Error ? (error.cause ?? error) : error
                const message = stage === "load" ? errorMessage(error) : errorMessage(cause)

                if (stage === "install") {
                  const parsed = parsePluginSpecifier(spec)
                  publishPluginError(`Failed to install plugin ${parsed.pkg}@${parsed.version}: ${message}`)
                  return
                }

                if (stage === "compatibility") {
                  publishPluginError(`Plugin ${spec} skipped: ${message}`)
                  return
                }

                if (stage === "entry") {
                  publishPluginError(`Failed to load plugin ${spec}: ${message}`)
                  return
                }

                publishPluginError(`Failed to load plugin ${spec}: ${message}`)
              },
            },
          }),
        )
        for (const load of loaded) {
          if (!load) continue

          // Keep plugin execution sequential so hook registration and execution
          // order remains deterministic across plugin runs.
          yield* Effect.tryPromise({
            try: () => applyPlugin(load, input, hooks, hooksWithMeta),
            catch: (err) => {
              const message = errorMessage(err)
              return message
            },
          }).pipe(
            Effect.tapError((error) => Effect.logError("failed to load plugin", { path: load.spec, error })),
            Effect.catch(() => {
              // TODO: make proper events for this
              // events.publish(Session.Event.Error, {
              //   error: new NamedError.Unknown({
              //     message: `Failed to load plugin ${load.spec}: ${message}`,
              //   }).toObject(),
              // })
              return Effect.void
            }),
          )
        }

        // Notify plugins of current config
        for (const hook of hooks) {
          yield* Effect.tryPromise({
            try: () => Promise.resolve((hook as any).config?.(cfg)),
            catch: errorMessage,
          }).pipe(
            Effect.tapError((error) => Effect.logError("plugin config hook failed", { error })),
            Effect.ignore,
          )
        }

        const unsubscribe = yield* events.listen((event) => {
          if (event.location?.directory !== ctx.directory) return Effect.void
          return Effect.sync(() => {
            for (const hook of hooks) {
              void hook["event"]?.({ event: { id: event.id, type: event.type, properties: event.data } as any })
            }
          })
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        yield* Effect.addFinalizer(() =>
          Effect.forEach(
            hooks,
            (hook) =>
              Effect.tryPromise({
                try: () => Promise.resolve(hook.dispose?.()),
                catch: errorMessage,
              }).pipe(
                Effect.tapError((error) => Effect.logError("plugin dispose hook failed", { error })),
                Effect.ignore,
              ),
            { discard: true },
          ),
        )

        return { hooks, hooksWithMeta }
      }),
    )

    const aggregateDecision = (
      input: ActorPreStopInput | ActorPostStopInput,
      eventName: "actor.preStop" | "actor.postStop",
    ) =>
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        const reasons: string[] = []
        const pluginNames: string[] = []
        const hookIDs: string[] = []
        let anyContinue = false

        for (const entry of s.hooksWithMeta) {
          const reg = entry.hook[eventName]
          if (!reg) continue

          const fn = typeof reg === "function" ? reg : reg.run
          const matcher: ActorMatcher | undefined = typeof reg === "function" ? undefined : reg.matcher
          if (!matchesActor(matcher, input)) {
            yield* events.publish(HookEvent.Executed, {
              event: eventName,
              hookID: entry.hookIDFor(eventName),
              pluginName: entry.pluginName,
              actorID: input.actorID,
              agentType: input.agentType,
              durationMs: 0,
              outcome: "skipped",
              continueRequested: false,
              reasonLength: 0,
            })
            continue
          }

          const startedAt = Date.now()
          const output: ActorStopOutput = { continue: false }
          let hookOutcome: "success" | "error" = "success"
          yield* Effect.tryPromise({
            try: () => fn(input as never, output),
            catch: (err) => err,
          }).pipe(
            Effect.tapError((err) =>
              Effect.gen(function* () {
                hookOutcome = "error"
                yield* Effect.logError(`${eventName} hook failed`, {
                  pluginName: entry.pluginName,
                  hookID: entry.hookIDFor(eventName),
                  error: err,
                })
                yield* events.publish(Session.Event.Error, {
                  sessionID: SessionID.make(input.sessionID),
                  error: new NamedError.Unknown({
                    message: `${eventName} hook (${entry.pluginName}) failed: ${errorMessage(err)}`,
                  }).toObject(),
                })
              }),
            ),
            Effect.ignore,
          )

          yield* events.publish(HookEvent.Executed, {
            event: eventName,
            hookID: entry.hookIDFor(eventName),
            pluginName: entry.pluginName,
            actorID: input.actorID,
            agentType: input.agentType,
            durationMs: Date.now() - startedAt,
            outcome: hookOutcome,
            continueRequested: output.continue === true,
            reasonLength: output.reason?.length ?? 0,
          })

          if (output.continue === true && output.reason && output.reason.length > 0) {
            anyContinue = true
            reasons.push(output.reason)
            pluginNames.push(entry.pluginName)
            hookIDs.push(entry.hookIDFor(eventName))
            continue
          }
          if (output.continue === true) {
            yield* Effect.logWarning(`${eventName} hook returned continue=true without reason; ignored`, {
              pluginName: entry.pluginName,
            })
          }
        }

        return {
          continue: anyContinue,
          reason: reasons.length > 0 ? reasons.join("\n\n") : undefined,
          contributingPluginNames: pluginNames,
          contributingHookIDs: hookIDs,
        } satisfies ActorStopAggregatedDecision
      })

    const triggerActorPreStop = Effect.fn("Plugin.triggerActorPreStop")(function* (input: ActorPreStopInput) {
      return yield* aggregateDecision(input, "actor.preStop")
    })

    const triggerActorPostStop = Effect.fn("Plugin.triggerActorPostStop")(function* (input: ActorPostStopInput) {
      return yield* aggregateDecision(input, "actor.postStop")
    })

    const trigger = Effect.fn("Plugin.trigger")(function* <
      Name extends TriggerName,
      Input = Parameters<Required<Hooks>[Name]>[0],
      Output = Parameters<Required<Hooks>[Name]>[1],
    >(name: Name, input: Input, output: Output) {
      if (!name) return output
      const s = yield* InstanceState.get(state)
      for (const hook of s.hooks) {
        const fn = hook[name] as any
        if (!fn) continue
        yield* Effect.promise(async () => fn(input, output))
      }
      return output
    })

    const list = Effect.fn("Plugin.list")(function* () {
      const s = yield* InstanceState.get(state)
      return s.hooks
    })

    const init = Effect.fn("Plugin.init")(function* () {
      yield* InstanceState.get(state)
    })

    return Service.of({ trigger, list, init, triggerActorPreStop, triggerActorPostStop })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(EventV2Bridge.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export const node = LayerNode.make(layer, [EventV2Bridge.node, Config.node, RuntimeFlags.node])

export * as Plugin from "."
