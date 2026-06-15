import { LayerNode } from "@swust-code/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { InstanceContext } from "@/project/instance-context"
import { SessionID, MessageID } from "@/session/schema"
import { Effect, Layer, Context, Schema } from "effect"
import { Config } from "@/config/config"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import { EventV2 } from "@swust-code/core/event"
import { RuntimeFlags } from "@/effect/runtime-flags"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"

type State = {
  commands: Record<string, Info>
}

export const Event = {
  Executed: EventV2.define({
    type: "command.executed",
    schema: {
      name: Schema.String,
      sessionID: SessionID,
      arguments: Schema.String,
      messageID: MessageID,
    },
  }),
}

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Some command templates are lazy promises from MCP prompt resolution.
  template: Schema.Unknown,
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String),
}).annotate({ identifier: "Command" })

export type Info = Omit<Schema.Schema.Type<typeof Info>, "template"> & { template: Promise<string> | string }

export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  REVIEW: "review",
  DREAM: "dream",
  DISTILL: "distill",
  GOAL: "goal",
  DEEP_RESEARCH: "deep-research",
} as const

export function deepResearchTemplate(): string {
  return [
    "The user wants a deep, multi-source, fact-checked research report.",
    "",
    "Research request:",
    "$ARGUMENTS",
    "",
    "If the request is underspecified (missing scope, constraints, region, time range, etc.),",
    "ask 2-3 brief clarifying questions FIRST, then weave the answers into a refined question.",
    "",
    "When the request is specific enough, run the built-in deep-research workflow:",
    '  workflow({ operation: "run", name: "deep-research", args: "<the refined research question>" })',
    "",
    "Pass the full refined question as `args`. The workflow fans out web searches, fetches sources,",
    "adversarially verifies claims, and returns a cited report; relay its result to the user.",
  ].join("\n")
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Command") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service
    const flags = yield* RuntimeFlags.Service

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      commands[Default.INIT] = {
        name: Default.INIT,
        description: "guided AGENTS.md setup",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      }
      commands[Default.REVIEW] = {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", ctx.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      }
      commands[Default.DREAM] = {
        name: Default.DREAM,
        description: "manually consolidate project memory from memory files and raw trajectory",
        agent: "dream",
        source: "command",
        subtask: false,
        get template() {
          return [
            "Run one manual dream memory consolidation pass for the current project.",
            "",
            "User focus or constraints:",
            "$ARGUMENTS",
            "",
            "Use the memory files as the working index and the raw SWUST Code trajectory database as the source of truth.",
            "Use bash for read-only SQLite and filesystem inspection. Do not modify the database.",
            "Consolidate only durable, verified information into project memory.",
          ].join("\n")
        },
        hints: ["$ARGUMENTS"],
      }
      commands[Default.DISTILL] = {
        name: Default.DISTILL,
        description: "find repeated workflows in recent work and package them into skills, subagents, or commands",
        agent: "distill",
        source: "command",
        subtask: false,
        get template() {
          return [
            "Run one manual distill pass for the current project.",
            "",
            "User focus or constraints:",
            "$ARGUMENTS",
            "",
            "Look back over recent work and identify repeated manual workflows worth packaging.",
            "Use the raw SWUST Code trajectory database as the source of truth and memory files to spot cross-session patterns.",
            "Inventory existing skills, agents, and commands first so you reuse or extend instead of duplicating.",
            "Use bash for read-only SQLite and filesystem inspection. Do not modify the database.",
            "Produce a compact shortlist, then create only the high-confidence missing assets.",
          ].join("\n")
        },
        hints: ["$ARGUMENTS"],
      }
      commands[Default.GOAL] = {
        name: Default.GOAL,
        description: "run the request in goal mode until a judge says it is met. /goal clear to abort",
        agent: "goal",
        source: "command",
        subtask: false,
        get template() {
          return "$ARGUMENTS"
        },
        hints: ["$ARGUMENTS"],
      }

      if (flags.experimentalWorkflowTool) {
        commands[Default.DEEP_RESEARCH] = {
          name: Default.DEEP_RESEARCH,
          description: "deep multi-source, fact-checked research report (runs the deep-research workflow)",
          source: "command",
          subtask: false,
          get template() {
            return deepResearchTemplate()
          },
          hints: ["$ARGUMENTS"],
        }
      }

      for (const [name, command] of Object.entries(cfg.command ?? {})) {
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          hints: hints(command.template),
        }
      }

      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            return item.content
          },
          hints: [],
        }
      }

      return {
        commands,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.commands)
    })

    return Service.of({ get, list })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(MCP.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export const node = LayerNode.make(layer, [Config.node, MCP.node, Skill.node, RuntimeFlags.node])

export * as Command from "."
