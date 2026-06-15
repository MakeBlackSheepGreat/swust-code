import { afterEach, describe, expect } from "bun:test"
import { ConfigV1 } from "@swust-code/core/v1/config/config"
import { SessionV1 } from "@swust-code/core/v1/session"
import { Database } from "@swust-code/core/database/database"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { Agent } from "../../src/agent/agent"
import * as ActorRegistry from "../../src/actor/registry"
import * as ActorSpawn from "../../src/actor/spawn"
import { BackgroundJob } from "../../src/background/job"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Config } from "../../src/config/config"
import { CrossSpawnSpawner } from "@swust-code/core/cross-spawn-spawner"
import { Ripgrep } from "@swust-code/core/ripgrep"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionCheckpoint } from "../../src/session/checkpoint"
import { MessageID, type SessionID } from "../../src/session/schema"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { TaskRegistry } from "../../src/task/registry"
import { ActorTool } from "../../src/tool/actor"
import { Inbox } from "../../src/inbox"
import { checkpointPath } from "../../src/session/checkpoint-paths"
import { Truncate } from "../../src/tool/truncate"
import { ToolRegistry } from "../../src/tool/registry"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { ProviderV2 } from "@swust-code/core/provider"
import { ModelV2 } from "@swust-code/core/model"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const cfg = (url: string): Partial<ConfigV1.Info> => ({
  model: "test/test-model",
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: url,
      },
    },
  },
})

const noHookDecision = {
  continue: false,
  contributingPluginNames: [],
  contributingHookIDs: [],
}

const noHookPlugin = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({
    trigger: ((_name: unknown, _input: unknown, output: unknown) =>
      Effect.succeed(output)) as Plugin.Interface["trigger"],
    list: () => Effect.succeed([]),
    init: () => Effect.void,
    triggerActorPreStop: () => Effect.succeed(noHookDecision),
    triggerActorPostStop: () => Effect.succeed(noHookDecision),
  }),
)

const actorSpawnNoHook = ActorSpawn.layer.pipe(
  Layer.provide(ActorRegistry.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(SessionPrompt.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(TaskRegistry.defaultLayer),
  Layer.provide(SessionRunState.defaultLayer),
  Layer.provide(noHookPlugin),
  Layer.provide(EventV2Bridge.defaultLayer),
)

const layer = Layer.mergeAll(
  Agent.defaultLayer,
  ActorRegistry.defaultLayer,
  BackgroundJob.defaultLayer,
  EventV2Bridge.defaultLayer,
  Config.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
  Session.defaultLayer,
  SessionRunState.defaultLayer,
  SessionStatus.defaultLayer,
  TaskRegistry.defaultLayer,
  SessionCheckpoint.defaultLayer,
  actorSpawnNoHook,
  Inbox.defaultLayer,
  Truncate.defaultLayer,
  ToolRegistry.defaultLayer,
  Database.defaultLayer,
  RuntimeFlags.layer({ disableDefaultPlugins: true }),
  TestLLMServer.layer,
).pipe(Layer.provide(Ripgrep.defaultLayer))

const it = testEffect(layer)

const preStopRetryPlugin = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({
    trigger: ((_name: unknown, _input: unknown, output: unknown) =>
      Effect.succeed(output)) as Plugin.Interface["trigger"],
    list: () => Effect.succeed([]),
    init: () => Effect.void,
    triggerActorPreStop: (input) =>
      Effect.succeed(
        input.iteration === 0
          ? {
              continue: true,
              reason: "Revise the final response before returning it.",
              contributingPluginNames: ["test-plugin"],
              contributingHookIDs: ["test-plugin#actor.preStop"],
            }
          : noHookDecision,
      ),
    triggerActorPostStop: () => Effect.succeed(noHookDecision),
  }),
)

const actorSpawnWithPreStopRetry = ActorSpawn.layer.pipe(
  Layer.provide(ActorRegistry.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(SessionPrompt.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(TaskRegistry.defaultLayer),
  Layer.provide(SessionRunState.defaultLayer),
  Layer.provide(preStopRetryPlugin),
  Layer.provide(EventV2Bridge.defaultLayer),
)

const preStopLayer = Layer.mergeAll(
  Agent.defaultLayer,
  ActorRegistry.defaultLayer,
  BackgroundJob.defaultLayer,
  EventV2Bridge.defaultLayer,
  Config.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
  Session.defaultLayer,
  SessionRunState.defaultLayer,
  SessionStatus.defaultLayer,
  TaskRegistry.defaultLayer,
  SessionCheckpoint.defaultLayer,
  actorSpawnWithPreStopRetry,
  Inbox.defaultLayer,
  Truncate.defaultLayer,
  ToolRegistry.defaultLayer,
  Database.defaultLayer,
  RuntimeFlags.layer({ disableDefaultPlugins: true }),
  TestLLMServer.layer,
).pipe(Layer.provide(Ripgrep.defaultLayer))

const itPreStop = testEffect(preStopLayer)

const useServerConfig = Effect.fn("ActorToolTest.useServerConfig")(function* () {
  const { directory } = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* Effect.promise(() =>
    Bun.write(
      path.join(directory, "swust-code.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", ...cfg(llm.url) }),
    ),
  )
  return llm
})

const seed = Effect.fn("ActorToolTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Actor test" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

function ctx(input: { sessionID: SessionID; messageID: MessageID; text?: string }) {
  return {
    sessionID: input.sessionID,
    messageID: input.messageID,
    agent: "build",
    abort: new AbortController().signal,
    extra: {},
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

describe("tool.actor MiMo-compatible behavior", () => {
  it.instance('context="state" injects the latest checkpoint into the child prompt', () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { chat, assistant } = yield* seed()
      const file = checkpointPath(chat.id)
      yield* Effect.promise(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true })
        await Bun.write(file, "Parent milestone: checkpoint-visible\nNext step: keep going\n")
      })
      yield* llm.text("done")
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          operation: {
            action: "run",
            subagent_type: "general",
            description: "use state",
            prompt: "child prompt body",
            context: "state",
          },
        },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )

      expect(result.output).toContain("<actor_result")

      const sessions = yield* Session.Service
      const actorMessages = yield* sessions.messages({ sessionID: chat.id, agentID: "general-1" })
      const text = actorMessages
        .flatMap((message) =>
          message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text",
          ),
        )
        .map((part) => part.text)
        .join("\n")
      expect(text).toContain("<session-state>")
      expect(text).toContain("Parent milestone: checkpoint-visible")
      expect(text).toContain("child prompt body")
    }),
  )

  it.instance("malformed task_id degrades to ad-hoc with a notice", () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { chat, assistant } = yield* seed()
      yield* llm.text("done")
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          operation: {
            action: "run",
            subagent_type: "general",
            description: "inspect bug",
            prompt: "look into it",
            task_id: "not-a-task",
          },
        },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )

      expect(result.output).toContain('task_id "not-a-task"')
      expect(result.output.toLowerCase()).toContain("ran ad-hoc")
      expect(result.output).toContain("<actor_result")
      expect(result.metadata.sessionId).toBe(chat.id)

      const sessions = yield* Session.Service
      const actorMessages = yield* sessions.messages({ sessionID: chat.id, agentID: "general-1" })
      expect(actorMessages.map((message) => message.info.role)).toEqual(["user", "assistant"])
      expect(
        actorMessages.some((message) =>
          message.parts.some((part) => part.type === "text" && part.text.includes("look into it")),
        ),
      ).toBe(true)
    }),
  )

  it.instance("existing task_id follows the reported return header", () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { chat, assistant } = yield* seed()
      yield* llm.text("**Status**: blocked\n**Summary**: needs credentials\n\nCannot continue.")
      const tasks = yield* TaskRegistry.Service
      const task = yield* tasks.create({ session_id: chat.id, summary: "Investigate cache" })
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          operation: {
            action: "run",
            subagent_type: "general",
            description: "inspect bug",
            prompt: "look into it",
            task_id: task.id,
          },
        },
        ctx({
          sessionID: chat.id,
          messageID: assistant.id,
        }),
      )

      expect(result.output).toContain('<actor_result status="blocked" summary="needs credentials">')
      const updated = yield* tasks.get({ session_id: chat.id, id: task.id })
      expect(updated?.status).toBe("blocked")
    }),
  )

  it.instance("gate-eligible actor downgrades to partial when owned task stays open", () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { chat, assistant } = yield* seed()
      yield* llm.text("**Status**: success\n**Summary**: initial completion")
      yield* llm.text("**Status**: success\n**Summary**: still open")
      yield* llm.text("**Status**: success\n**Summary**: still open")
      const tasks = yield* TaskRegistry.Service
      const task = yield* tasks.create({ session_id: chat.id, summary: "Close the loop" })
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          operation: {
            action: "run",
            subagent_type: "general",
            description: "complete task",
            prompt: "finish it",
            task_id: task.id,
          },
        },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )

      expect(result.output).toContain('<actor_result status="partial"')
      expect(result.output).toContain("**Incomplete tasks**")
      expect(result.output).toContain(task.id)
      expect(yield* llm.calls).toBe(3)

      const updated = yield* tasks.get({ session_id: chat.id, id: task.id })
      expect(updated?.status).toBe("in_progress")
      expect(updated?.owner).toBe("general-1")
    }),
  )

  itPreStop.instance("actor.preStop can request a MiMo-style re-entry before delivery", () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { chat, assistant } = yield* seed()
      yield* llm.text("first draft")
      yield* llm.text("second draft")
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          operation: {
            action: "run",
            subagent_type: "general",
            description: "revise before return",
            prompt: "produce a final answer",
          },
        },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )

      expect(result.output).toContain("second draft")
      expect(result.output).not.toContain("first draft")
      expect(yield* llm.calls).toBe(2)
    }),
  )

  it.instance("cancel on an already-idle actor is idempotent", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const registry = yield* ActorRegistry.Service
      yield* registry.register({
        sessionID: chat.id,
        actorID: "general-1",
        mode: "subagent",
        status: "idle",
        lastOutcome: "success",
        lifecycle: "ephemeral",
        agent: "general",
        description: "already done",
        background: true,
      })
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        { operation: { action: "cancel", actor_id: "general-1" } },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )
      const body = JSON.parse(result.output)
      expect(body.status).toBe("idle")
      expect(body.lastOutcome).toBe("success")
    }),
  )

  it.instance("wait on a completed registry-only actor returns without polling forever", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const registry = yield* ActorRegistry.Service
      yield* registry.register({
        sessionID: chat.id,
        actorID: "general-1",
        mode: "subagent",
        status: "idle",
        lastOutcome: "success",
        lifecycle: "ephemeral",
        agent: "general",
        description: "already done",
        background: true,
      })
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        { operation: { action: "wait", actor_id: "general-1", timeout_ms: 1 } },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )
      const body = JSON.parse(result.output)
      expect(body.status).toBe("idle")
      expect(body.lastOutcome).toBe("success")
    }),
  )

  it.instance("send to an existing actor writes to the inbox", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const registry = yield* ActorRegistry.Service
      const inbox = yield* Inbox.Service
      yield* registry.register({
        sessionID: chat.id,
        actorID: "general-1",
        mode: "subagent",
        status: "running",
        lifecycle: "ephemeral",
        agent: "general",
        description: "target actor",
        background: true,
      })
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        { operation: { action: "send", to_actor_id: "general-1", content: "hello actor" } },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )
      const body = JSON.parse(result.output)
      expect(body.inboxID).toBeString()
      expect(result.title).toBe("Sent to general-1")

      const rows = yield* inbox.list(chat.id, "general-1")
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(body.inboxID)
      expect(rows[0].content).toBe("hello actor")

      const sessions = yield* Session.Service
      yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: chat.id,
        agentID: "general-1",
        agent: "general",
        model: ref,
        time: { created: Date.now() },
      })

      const drained = yield* inbox.drain(chat.id, "general-1")
      expect(drained).toBe(1)
      expect(yield* inbox.list(chat.id, "general-1")).toHaveLength(0)

      const actorMessages = yield* sessions.messages({ sessionID: chat.id, agentID: "general-1" })
      const synthetic = actorMessages.flatMap((message) =>
        message.parts.filter(
          (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
            part.type === "text" && part.synthetic === true,
        ),
      )
      expect(synthetic).toHaveLength(1)
      expect(synthetic[0].text).toContain("<inbox")
      expect(synthetic[0].text).toContain("hello actor")
    }),
  )

  it.instance("send to a missing actor returns a structured receiver-not-found error", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const tool = yield* ActorTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        { operation: { action: "send", to_actor_id: "missing-1", content: "hello" } },
        ctx({ sessionID: chat.id, messageID: assistant.id }),
      )
      const body = JSON.parse(result.output)
      expect(body.inboxID).toBeNull()
      expect(body.error).toBe("receiver not found")
      expect(result.title).toContain("receiver not found")
    }),
  )
})
