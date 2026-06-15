/**
 * Actor Spawn - MiMo-compatible actor execution.
 *
 * Subagents run in the parent session under their own agentID slice. Peer actors
 * keep a child session for isolation. The message slice is the important MiMo
 * compatibility point: SessionPrompt persists user/assistant messages with
 * agentID, and MessageV2 defaults to the main slice unless explicitly asked.
 */

import { ModelV2 } from "@swust-code/core/model"
import { ProviderV2 } from "@swust-code/core/provider"
import { SessionV1 } from "@swust-code/core/v1/session"
import { Cause, Context, Deferred, Effect, Fiber, Layer, Result, Schema, Scope } from "effect"
import * as ActorRegistry from "./registry"
import type { ActorMode, ActorOutcome } from "./registry"
import { parseReturnHeader } from "./return-header"
import { spawnRef } from "./spawn-ref"
import { Agent } from "@/agent/agent"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionRunState } from "@/session/run-state"
import { MAX_TASK_GATE_SUBAGENT_REACT, TaskGate } from "@/task/gate"
import { TaskRegistry } from "@/task/registry"
import { TaskID } from "@/task/schema"
import { HookEvent, Plugin } from "@/plugin"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { SYSTEM_SPAWNED_AGENT_TYPES } from "@/agent/config"

export const MAX_PRE_REACT = 3
export const MAX_POST_REACT = 3

const RETURN_FORMAT_INSTRUCTION = `

---

## Return format (required)

Your FINAL assistant message MUST start with this header block:

  **Status**: success | partial | failed | blocked
  **Summary**: <one sentence describing what happened>

After the header, include the actual deliverable. Do not precede the header with an introduction.
`

/**
 * Captures parent agent context for prompt-cache alignment.
 * SWUST stores this for compatibility; the current prompt loop does not consume
 * it yet.
 */
export interface ForkContext {
  readonly systemPrompts: ReadonlyArray<string>
  readonly toolSchemas: ReadonlyArray<unknown>
  readonly modelID?: string
  readonly providerID?: string
  readonly parentMessages: ReadonlyArray<unknown>
  readonly watermarkMessageID?: string
}

export interface AgentOutcome {
  readonly status: "success" | "failure" | "cancelled"
  readonly finalText?: string
  readonly error?: string
  readonly reportedStatus?: string
  readonly reportedSummary?: string
  readonly incompleteTasks?: ReadonlyArray<string>
}

export interface SpawnInput {
  readonly mode: ActorMode
  readonly sessionID: string
  readonly parentSessionID?: string
  readonly actorID?: string
  readonly agentType: string
  readonly task: string
  readonly description?: string
  readonly background?: boolean
  readonly lifecycle?: "ephemeral" | "persistent"
  readonly parentActorID?: string
  readonly toolAllowlist?: ReadonlyArray<string>
  readonly model?: { readonly providerID: string; readonly modelID: string }
  readonly forkContext?: ForkContext
  readonly task_id?: string
  readonly format?: SessionV1.User["format"]
}

export interface SpawnResult {
  readonly actorID: string
  readonly sessionID: string
  readonly outcome: Deferred.Deferred<AgentOutcome>
}

export interface Interface {
  readonly spawn: (input: SpawnInput) => Effect.Effect<SpawnResult>
  readonly cancel: (sessionID: string, actorID: string) => Effect.Effect<void>
  readonly getForkContext: (actorID: string) => ForkContext | undefined
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/ActorSpawn") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const registry = yield* ActorRegistry.Service
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const agents = yield* Agent.Service
    const taskRegistry = yield* TaskRegistry.Service
    const runState = yield* SessionRunState.Service
    const plugin = yield* Plugin.Service
    const events = yield* EventV2Bridge.Service
    const scope = yield* Scope.Scope
    const forkContexts = new Map<string, ForkContext>()
    const childSessions = new Map<string, SessionID>()

    const key = (sessionID: string, actorID: string) => `${sessionID}:${actorID}`

    const toModelRef = (model: SpawnInput["model"]) =>
      model
        ? {
            providerID: ProviderV2.ID.make(model.providerID),
            modelID: ModelV2.ID.make(model.modelID),
          }
        : undefined

    const validTaskID = (taskID: string | undefined) => {
      if (!taskID) return undefined
      return Result.isSuccess(Schema.decodeUnknownResult(TaskID)(taskID)) ? TaskID.make(taskID) : undefined
    }

    const finalTextFrom = (result: SessionV1.WithParts) =>
      result.parts.findLast(
        (part): part is Extract<(typeof result.parts)[number], { type: "text" }> => part.type === "text",
      )?.text

    const outcomeFromText = (finalText: string | undefined) => {
      const reported = parseReturnHeader(finalText)
      return {
        status: "success" as const,
        finalText: finalText ?? "",
        ...(reported.status ? { reportedStatus: reported.status } : {}),
        ...(reported.summary ? { reportedSummary: reported.summary } : {}),
      } satisfies AgentOutcome
    }

    const incompleteText = (input: { outcome: AgentOutcome; status: "partial" | "blocked"; tasks: string[] }) => {
      const summary =
        input.outcome.reportedSummary ??
        (input.status === "partial" ? "incomplete actor tasks remain" : "blocked actor tasks remain")
      return {
        ...input.outcome,
        status: "success" as const,
        reportedStatus: input.status,
        reportedSummary: summary,
        incompleteTasks: input.tasks,
        finalText: [
          `**Status**: ${input.status}`,
          `**Summary**: ${summary}`,
          "",
          input.outcome.finalText ?? "",
          "",
          `**Incomplete tasks**: ${input.tasks.join(", ")}`,
        ].join("\n"),
      } satisfies AgentOutcome
    }

    const runAgentLoop = Effect.fn("ActorSpawn.runAgentLoop")(function* (input: {
      readonly sessionID: SessionID
      readonly actorID: string
      readonly agentType: string
      readonly task: string
      readonly model?: SpawnInput["model"]
      readonly task_id?: string
      readonly format?: SessionV1.User["format"]
      readonly source: "spawn" | "hook"
      readonly provenance?: Record<string, unknown>
    }) {
      const result = yield* prompt.prompt({
        sessionID: input.sessionID,
        agent: input.agentType,
        agentID: input.actorID,
        source: input.source,
        provenance: input.provenance,
        model: toModelRef(input.model),
        task_id: input.task_id,
        ...(input.format ? { format: input.format } : {}),
        parts: [{ type: "text", text: input.task }],
      })
      return finalTextFrom(result)
    })

    const reconcileTask = Effect.fn("ActorSpawn.reconcileTask")(function* (input: {
      readonly parentSessionID: SessionID
      readonly actorID: string
      readonly taskID?: TaskID
      readonly outcome: AgentOutcome
    }) {
      if (!input.taskID) return
      const outcomeError = input.outcome.status === "failure" ? input.outcome.error : undefined
      if (
        input.outcome.status === "failure" ||
        input.outcome.reportedStatus === "failed" ||
        input.outcome.reportedStatus === "blocked"
      ) {
        yield* taskRegistry
          .block({
            session_id: input.parentSessionID,
            id: input.taskID,
            event_summary:
              input.outcome.reportedSummary ?? outcomeError ?? `actor ${input.actorID} did not complete`,
          })
          .pipe(Effect.ignoreCause)
        return
      }
      if (input.outcome.status !== "cancelled" && input.outcome.reportedStatus !== "partial") {
        yield* taskRegistry
          .done({
            session_id: input.parentSessionID,
            id: input.taskID,
            event_summary: input.outcome.reportedSummary ?? `actor ${input.actorID} completed`,
          })
          .pipe(Effect.ignoreCause)
      }
    })

    type RunActorInput = {
      readonly sessionID: SessionID
      readonly parentSessionID: SessionID
      readonly actorID: string
      readonly agentType: string
      readonly task: string
      readonly description?: string
      readonly mode: ActorMode
      readonly lifecycle: "ephemeral" | "persistent"
      readonly parentActorID?: string
      readonly model?: SpawnInput["model"]
      readonly task_id?: string
      readonly format?: SessionV1.User["format"]
      readonly gateEligible?: boolean
    }

    const runActor = Effect.fn("ActorSpawn.runActor")(function* (input: RunActorInput) {
      yield* registry.updateStatus(input.sessionID, input.actorID, "running")

      const taskID = validTaskID(input.task_id)
      if (taskID) {
        yield* taskRegistry
          .start({
            session_id: input.parentSessionID,
            id: taskID,
            owner: input.actorID,
            event_summary: `actor ${input.actorID} started`,
          })
          .pipe(Effect.ignoreCause)
      }

      let outcome: AgentOutcome = { status: "failure", error: "actor did not run" }
      let preIteration = 0
      let preReentry:
        | { readonly reason: string; readonly contributingPluginNames: string[]; readonly contributingHookIDs: string[] }
        | undefined

      while (true) {
        outcome = yield* runAgentLoop({
          sessionID: input.sessionID,
          actorID: input.actorID,
          agentType: input.agentType,
          task: preReentry ? preReentry.reason : input.task,
          model: input.model,
          task_id: input.task_id,
          format: input.format,
          source: preReentry ? "hook" : "spawn",
          provenance: preReentry
            ? {
                hookPhase: "pre",
                hookIteration: preIteration,
                pluginNames: preReentry.contributingPluginNames,
                hookIDs: preReentry.contributingHookIDs,
              }
            : undefined,
        }).pipe(
          Effect.map(outcomeFromText),
          Effect.catchCause((cause) =>
            Effect.succeed(
              Cause.hasInterruptsOnly(cause)
                ? ({ status: "cancelled" as const } satisfies AgentOutcome)
                : ({ status: "failure" as const, error: Cause.pretty(cause) } satisfies AgentOutcome),
            ),
          ),
        )

        if (outcome.status !== "success") break

        preIteration++
        if (preIteration > MAX_PRE_REACT) {
          yield* events.publish(HookEvent.ReActMaxReached, {
            phase: "pre",
            actorID: input.actorID,
            agentType: input.agentType,
          })
          yield* Effect.logWarning("actor.preStop hit MAX_PRE_REACT cap; skipping further hook checks", {
            actorID: input.actorID,
            totalTurns: preIteration,
          })
          break
        }

        const decision = yield* plugin.triggerActorPreStop({
          sessionID: input.sessionID,
          ...(input.parentSessionID !== input.sessionID ? { parentSessionID: input.parentSessionID } : {}),
          actorID: input.actorID,
          ...(input.parentActorID ? { parentActorID: input.parentActorID } : {}),
          agentType: input.agentType,
          mode: input.mode,
          lifecycle: input.lifecycle,
          finalText: outcome.finalText,
          task: input.task,
          ...(input.description ? { description: input.description } : {}),
          ...(input.task_id ? { task_id: input.task_id } : {}),
          iteration: preIteration - 1,
        })
        if (!decision.continue) break
        if (!decision.reason) break

        yield* events.publish(HookEvent.ReActReentered, {
          phase: "pre",
          actorID: input.actorID,
          agentType: input.agentType,
          iteration: preIteration,
          triggeredByPlugins: decision.contributingPluginNames,
          reasonPreview: decision.reason.slice(0, 200),
        })

        preReentry = {
          reason: decision.reason,
          contributingPluginNames: decision.contributingPluginNames,
          contributingHookIDs: decision.contributingHookIDs,
        }
      }

      if (input.gateEligible && outcome.status === "success" && (!outcome.reportedStatus || outcome.reportedStatus === "success")) {
        let gateIter = 0
        while (true) {
          const decision = yield* TaskGate.decide({
            session_id: input.parentSessionID,
            owner: input.actorID,
            reactCount: gateIter,
            maxReact: MAX_TASK_GATE_SUBAGENT_REACT,
            mode: "subagent",
          }).pipe(Effect.provideService(TaskRegistry.Service, taskRegistry))
          if (!decision.needReentry) break
          gateIter++
          const gateOutcome = yield* runAgentLoop({
            sessionID: input.sessionID,
            actorID: input.actorID,
            agentType: input.agentType,
            task: decision.reentryText,
            model: input.model,
            task_id: input.task_id,
            format: input.format,
            source: "hook",
            provenance: { hookPhase: "post", hookIteration: gateIter, pluginNames: [], hookIDs: [] },
          }).pipe(
            Effect.map(outcomeFromText),
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("actor task gate re-entry failed", {
                  actorID: input.actorID,
                  cause: Cause.pretty(cause),
                })
                return undefined
              }),
            ),
          )
          if (!gateOutcome) break
          outcome = gateOutcome
          if (outcome.reportedStatus && outcome.reportedStatus !== "success") break
        }

        const remaining = yield* taskRegistry
          .list({ session_id: input.parentSessionID, owner: input.actorID, include_terminal: false })
          .pipe(Effect.orElseSucceed(() => []))
        const actionable = remaining.filter((task) => task.status === "open" || task.status === "in_progress")
        if (actionable.length > 0) {
          outcome = incompleteText({
            outcome,
            status: "partial",
            tasks: actionable.map((task) => task.id),
          })
        } else if (remaining.length > 0) {
          outcome = incompleteText({
            outcome,
            status: "blocked",
            tasks: remaining.map((task) => task.id),
          })
        }
      }

      if (outcome.status === "success") {
        const agentInfo = yield* agents.get(input.agentType)
        const canWrite = agentInfo ? !Permission.disabled(["write"], agentInfo.permission).has("write") : true
        let postIter = 0
        let lastFinalText = outcome.finalText

        while (true) {
          const decision = yield* plugin.triggerActorPostStop({
            sessionID: input.sessionID,
            ...(input.parentSessionID !== input.sessionID ? { parentSessionID: input.parentSessionID } : {}),
            actorID: input.actorID,
            ...(input.parentActorID ? { parentActorID: input.parentActorID } : {}),
            agentType: input.agentType,
            mode: input.mode,
            lifecycle: input.lifecycle,
            finalText: lastFinalText,
            task: input.task,
            ...(input.description ? { description: input.description } : {}),
            ...(input.task_id ? { task_id: input.task_id } : {}),
            outcome: "success",
            iteration: postIter,
            canWrite,
          })
          if (!decision.continue) break
          if (!decision.reason) break
          if (postIter >= MAX_POST_REACT) {
            yield* events.publish(HookEvent.ReActMaxReached, {
              phase: "post",
              actorID: input.actorID,
              agentType: input.agentType,
            })
            yield* Effect.logWarning("actor.postStop hit MAX_POST_REACT cap; skipping further hook checks", {
              actorID: input.actorID,
              totalTurns: postIter + 1,
            })
            break
          }

          postIter++
          yield* events.publish(HookEvent.ReActReentered, {
            phase: "post",
            actorID: input.actorID,
            agentType: input.agentType,
            iteration: postIter,
            triggeredByPlugins: decision.contributingPluginNames,
            reasonPreview: decision.reason.slice(0, 200),
          })

          const newFinalText = yield* runAgentLoop({
            sessionID: input.sessionID,
            actorID: input.actorID,
            agentType: input.agentType,
            task: decision.reason,
            model: input.model,
            task_id: input.task_id,
            format: input.format,
            source: "hook",
            provenance: {
              hookPhase: "post",
              hookIteration: postIter,
              pluginNames: decision.contributingPluginNames,
              hookIDs: decision.contributingHookIDs,
            },
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                yield* Effect.logError("actor.postStop run failed", {
                  actorID: input.actorID,
                  cause: Cause.pretty(cause),
                })
                return undefined
              }),
            ),
          )
          if (newFinalText === undefined) break
          lastFinalText = newFinalText
        }
      }

      const lastOutcome: ActorOutcome =
        outcome.status === "success" ? "success" : outcome.status === "cancelled" ? "cancelled" : "failure"
      yield* registry.updateStatus(
        input.sessionID,
        input.actorID,
        "idle",
        lastOutcome,
        outcome.status === "failure" ? outcome.error : undefined,
      )
      yield* reconcileTask({ parentSessionID: input.parentSessionID, actorID: input.actorID, taskID, outcome })
      yield* Effect.sync(() => forkContexts.delete(input.actorID))
      return outcome
    })

    const forkActorWork = Effect.fn("ActorSpawn.forkActorWork")(function* (
      input: RunActorInput & { readonly background: boolean },
    ) {
      const outcome = yield* Deferred.make<AgentOutcome>()
      const work = runActor(input).pipe(
        Effect.flatMap((result) => Deferred.succeed(outcome, result)),
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const result: AgentOutcome = Cause.hasInterruptsOnly(cause)
              ? { status: "cancelled" as const }
              : { status: "failure" as const, error: Cause.pretty(cause) }
            yield* registry
              .updateStatus(
                input.sessionID,
                input.actorID,
                "idle",
                result.status === "cancelled" ? "cancelled" : "failure",
                result.status === "failure" ? result.error : undefined,
              )
              .pipe(Effect.ignore)
            yield* Effect.sync(() => forkContexts.delete(input.actorID))
            yield* Deferred.succeed(outcome, result)
          }),
        ),
      )
      const fiber = yield* work.pipe(Effect.forkIn(scope))
      if (!input.background) yield* Fiber.join(fiber).pipe(Effect.ignore)
      return outcome
    })

    const spawnPeer = Effect.fn("ActorSpawn.spawnPeer")(function* (input: SpawnInput) {
      const parentSessionID = SessionID.make(input.sessionID)
      const child = yield* sessions.create({
        parentID: parentSessionID,
        title: input.description ?? `${input.agentType}: ${input.task.slice(0, 40)}`,
        agent: input.agentType,
        model: input.model
          ? {
              id: ModelV2.ID.make(input.model.modelID),
              providerID: ProviderV2.ID.make(input.model.providerID),
            }
          : undefined,
      })
      const actorID = child.id
      childSessions.set(key(parentSessionID, actorID), child.id)

      yield* registry.register({
        sessionID: child.id,
        actorID,
        mode: "peer",
        parentActorID: input.parentActorID,
        status: "pending",
        lifecycle: input.lifecycle ?? "persistent",
        agent: input.agentType,
        description: input.description ?? input.task.slice(0, 100),
        background: input.background ?? false,
      })

      if (input.forkContext) forkContexts.set(actorID, input.forkContext)

      const outcome = yield* forkActorWork({
        sessionID: child.id,
        parentSessionID: child.id,
        actorID,
        agentType: input.agentType,
        task: input.task,
        description: input.description,
        mode: "peer",
        lifecycle: input.lifecycle ?? "persistent",
        parentActorID: input.parentActorID,
        model: input.model,
        task_id: input.task_id,
        format: input.format,
        gateEligible: false,
        background: input.background ?? false,
      })

      return { actorID, sessionID: child.id, outcome }
    })

    const spawnSubagent = Effect.fn("ActorSpawn.spawnSubagent")(function* (input: SpawnInput) {
      const sessionID = SessionID.make(input.sessionID)
      const parentSessionID = SessionID.make(input.parentSessionID ?? input.sessionID)
      const actorID = input.actorID ?? (yield* registry.allocateActorID(sessionID, input.agentType))
      const agentInfo = yield* agents.get(input.agentType)

      yield* registry.register({
        sessionID,
        actorID,
        mode: "subagent",
        parentActorID: input.parentActorID,
        status: "pending",
        lifecycle: input.lifecycle ?? "ephemeral",
        agent: input.agentType,
        description: input.description ?? input.task.slice(0, 100),
        background: input.background ?? false,
      })

      if (input.forkContext) forkContexts.set(actorID, input.forkContext)

      const needsReturnHeader =
        agentInfo?.mode === "subagent" && !agentInfo.prompt && !SYSTEM_SPAWNED_AGENT_TYPES.has(input.agentType)
      const task = needsReturnHeader ? input.task + RETURN_FORMAT_INSTRUCTION : input.task
      const outcome = yield* forkActorWork({
        sessionID,
        parentSessionID,
        actorID,
        agentType: input.agentType,
        task,
        description: input.description,
        mode: "subagent",
        lifecycle: input.lifecycle ?? "ephemeral",
        parentActorID: input.parentActorID,
        model: input.model,
        task_id: input.task_id,
        format: input.format,
        gateEligible: needsReturnHeader,
        background: input.background ?? false,
      })

      return { actorID, sessionID, outcome }
    })

    const spawn = Effect.fn("ActorSpawn.spawn")(function* (input: SpawnInput) {
      if (input.mode === "peer") return yield* spawnPeer(input)
      return yield* spawnSubagent(input)
    })

    const cancel: (sessionID: string, actorID: string) => Effect.Effect<void> = Effect.fn("ActorSpawn.cancel")(function* (
      sessionID: string,
      actorID: string,
    ) {
      const parentSessionID = SessionID.make(sessionID)
      const children = yield* registry.listByParent(parentSessionID, actorID)
      yield* Effect.forEach(children, (child) => cancel(parentSessionID, child.actorID), {
        concurrency: "unbounded",
        discard: true,
      })

      const childSessionID = childSessions.get(key(parentSessionID, actorID))
      if (childSessionID) {
        yield* prompt.cancel(childSessionID).pipe(Effect.ignore)
        yield* registry.updateStatus(childSessionID, actorID, "idle", "cancelled").pipe(Effect.ignore)
      } else {
        yield* runState.cancelActor(parentSessionID, actorID).pipe(Effect.ignore)
      }
      yield* registry.updateStatus(parentSessionID, actorID, "idle", "cancelled").pipe(Effect.ignore)
      yield* Effect.sync(() => forkContexts.delete(actorID))
    })

    const getForkContext = (actorID: string): ForkContext | undefined => forkContexts.get(actorID)

    const impl = Service.of({ spawn, cancel, getForkContext })
    spawnRef.current = impl
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (spawnRef.current === impl) spawnRef.current = undefined
      }),
    )
    return impl
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(ActorRegistry.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(SessionPrompt.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(TaskRegistry.defaultLayer),
    Layer.provide(SessionRunState.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(EventV2Bridge.defaultLayer),
  ),
)
