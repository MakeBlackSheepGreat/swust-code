import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Command } from "@/command"
import { MCP } from "@/mcp"
import { Skill } from "@/skill"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances } from "../fixture/fixture"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

const mcpLayer = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth in command tests"),
    authenticate: () => Effect.die("unexpected MCP auth in command tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in command tests"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

const skillLayer = Layer.succeed(
  Skill.Service,
  Skill.Service.of({
    get: () => Effect.succeed(undefined),
    require: (name) => Effect.fail(new Skill.NotFoundError({ name, available: [] })),
    all: () => Effect.succeed([]),
    dirs: () => Effect.succeed([]),
    available: () => Effect.succeed([]),
  }),
)

const makeLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Command.layer.pipe(
    Layer.provide(TestConfig.layer()),
    Layer.provide(mcpLayer),
    Layer.provide(skillLayer),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const it = testEffect(makeLayer())
const withWorkflow = testEffect(makeLayer({ experimentalWorkflowTool: true }))

const resolveTemplate = (template: Command.Info["template"]) => Effect.promise(() => Promise.resolve(template))

afterEach(async () => {
  await disposeAllInstances()
})

describe("command registry", () => {
  it.instance("registers MiMo-compatible dream and distill commands", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const list = yield* command.list()
      const names = list.map((item) => item.name)

      expect(names).toContain(Command.Default.DREAM)
      expect(names).toContain(Command.Default.DISTILL)

      const dream = yield* command.get(Command.Default.DREAM)
      expect(dream).toMatchObject({
        name: "dream",
        description: "manually consolidate project memory from memory files and raw trajectory",
        agent: "dream",
        source: "command",
        subtask: false,
        hints: ["$ARGUMENTS"],
      })
      const dreamTemplate = yield* resolveTemplate(dream!.template)
      expect(dreamTemplate).toContain("Run one manual dream memory consolidation pass")
      expect(dreamTemplate).toContain("raw SWUST Code trajectory database")
      expect(dreamTemplate).not.toContain("mimocode")

      const distill = yield* command.get(Command.Default.DISTILL)
      expect(distill).toMatchObject({
        name: "distill",
        description: "find repeated workflows in recent work and package them into skills, subagents, or commands",
        agent: "distill",
        source: "command",
        subtask: false,
        hints: ["$ARGUMENTS"],
      })
      const distillTemplate = yield* resolveTemplate(distill!.template)
      expect(distillTemplate).toContain("Run one manual distill pass")
      expect(distillTemplate).toContain("Inventory existing skills, agents, and commands first")
      expect(distillTemplate).toContain("raw SWUST Code trajectory database")
      expect(distillTemplate).not.toContain("mimocode")

      const goal = yield* command.get(Command.Default.GOAL)
      expect(goal).toMatchObject({
        name: "goal",
        agent: "goal",
        source: "command",
        subtask: false,
        hints: ["$ARGUMENTS"],
      })
    }),
  )

  it.instance("hides the MiMo-compatible deep-research command by default", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      expect(yield* command.get(Command.Default.DEEP_RESEARCH)).toBeUndefined()
    }),
  )

  withWorkflow.instance("registers the MiMo-compatible deep-research command when workflow tool is enabled", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const research = yield* command.get(Command.Default.DEEP_RESEARCH)

      expect(research).toMatchObject({
        name: "deep-research",
        description: "deep multi-source, fact-checked research report (runs the deep-research workflow)",
        source: "command",
        subtask: false,
        hints: ["$ARGUMENTS"],
      })
      const template = yield* resolveTemplate(research!.template)
      expect(template).toContain('workflow({ operation: "run", name: "deep-research"')
      expect(template).toContain("$ARGUMENTS")
    }),
  )
})
