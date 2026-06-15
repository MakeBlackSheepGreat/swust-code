import { describe, expect } from "bun:test"
import { ConfigV1 } from "@swust-code/core/v1/config/config"
import { Effect, Layer } from "effect"
import path from "path"
import * as ActorSpawn from "@/actor/spawn"
import { Session } from "@/session/session"
import { Service as WorkflowService, defaultLayer, type Interface as Workflow, type WorkflowRun } from "@/workflow/runtime"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

const testLayer = Layer.mergeAll(defaultLayer, ActorSpawn.defaultLayer, Session.defaultLayer, TestLLMServer.layer)
const it = testEffect(testLayer)

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

const useServerConfig = Effect.fn("workflow.test.useServerConfig")(function* () {
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

const createSession = Effect.fn("workflow.test.createSession")(function* (title: string) {
  const sessions = yield* Session.Service
  return yield* sessions.create({
    title,
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  })
})

const waitForTerminalRun = (workflow: Workflow, runID: string) =>
  Effect.gen(function* () {
    while (true) {
      const run = yield* workflow.getStatus(runID)
      if (run && run.status !== "running") return run
      yield* Effect.sleep("10 millis")
    }
  }).pipe(
    Effect.timeoutOrElse({
      duration: "2 seconds",
      orElse: () => Effect.fail(new Error(`workflow ${runID} did not finish`)),
    }),
  )

describe("workflow runtime", () => {
  it.instance("executes workflow scripts and journals host calls", Effect.gen(function* () {
    const llm = yield* useServerConfig()
    const workflow = yield* WorkflowService
    const parent = yield* createSession("workflow test")
    yield* llm.text("workflow plan result")
    const run = yield* workflow.start({
      sessionID: parent.id,
      script: `
export const meta = {
  name: 'test-workflow',
  description: 'test workflow',
  phases: [{ title: 'Plan' }],
}

phase('Plan')
log('planning')
const result = await agent('summarize the plan', { label: 'planner' })
return { ok: true, text: result.text }
`,
      scriptDeadlineMs: 5_000,
      agentTimeoutMs: 5_000,
    })

    expect(run.status).toBe("running")

    const completed = yield* waitForTerminalRun(workflow, run.runID)
    expect(completed).toMatchObject({
      status: "completed",
      agentCount: 1,
      succeededCount: 1,
      failedCount: 0,
      currentPhase: "Plan",
    } satisfies Partial<WorkflowRun>)

    const journal = yield* workflow.getJournal(run.runID)
    expect(journal.some((entry) => entry.type === "phase" && (entry.data as { title?: string }).title === "Plan")).toBe(true)
    expect(journal.some((entry) => entry.type === "log" && (entry.data as { message?: string }).message === "planning")).toBe(true)
    expect(
      journal.some(
        (entry) =>
          entry.type === "agent_complete" &&
          JSON.stringify((entry.data as { result?: unknown }).result).includes("workflow plan result"),
      ),
    ).toBe(true)

    const agentComplete = journal.find((entry) => entry.type === "agent_complete")
    const agentResult = (agentComplete?.data as { result?: { actorID?: string } } | undefined)?.result
    expect(agentResult?.actorID).toBe("general-1")

    const sessions = yield* Session.Service
    const mainMessages = yield* sessions.messages({ sessionID: parent.id })
    expect(mainMessages).toHaveLength(0)

    const allMessages = yield* sessions.messages({ sessionID: parent.id, agentID: "*" })
    const actorMessages = allMessages.filter((message) => message.info.agentID === "general-1")
    expect(actorMessages.map((message) => message.info.role)).toEqual(["user", "assistant"])
    expect(actorMessages.some((message) => message.parts.some((part) => part.type === "text" && part.text.includes("summarize the plan")))).toBe(true)
    expect(actorMessages.some((message) => message.parts.some((part) => part.type === "text" && part.text.includes("workflow plan result")))).toBe(true)
  }))

  it.instance("keeps parallel agent calls bounded without deadlocking", Effect.gen(function* () {
    const llm = yield* useServerConfig()
    const workflow = yield* WorkflowService
    const parent = yield* createSession("workflow parallel")
    yield* llm.text("first result")
    yield* llm.text("second result")
    const run = yield* workflow.start({
      sessionID: parent.id,
      maxConcurrentAgents: 1,
      script: `
export const meta = { name: 'parallel-agents', description: 'parallel agent calls' }
phase('Parallel')
const results = await parallel([
  () => agent('first', { label: 'first' }),
  () => agent('second', { label: 'second' }),
])
return results.length
`,
      scriptDeadlineMs: 5_000,
      agentTimeoutMs: 5_000,
    })

    const completed = yield* waitForTerminalRun(workflow, run.runID)
    expect(completed).toMatchObject({
      status: "completed",
      agentCount: 2,
      succeededCount: 2,
      failedCount: 0,
    } satisfies Partial<WorkflowRun>)

    const sessions = yield* Session.Service
    const allMessages = yield* sessions.messages({ sessionID: parent.id, agentID: "*" })
    const actorIDs = Array.from(new Set(allMessages.map((message) => message.info.agentID)))
    expect(actorIDs).toEqual(["general-1", "general-2"])
    for (const actorID of actorIDs) {
      const slice = allMessages.filter((message) => message.info.agentID === actorID)
      expect(slice.map((message) => message.info.role)).toEqual(["user", "assistant"])
    }
  }))

  it.instance("marks scripts that throw as failed", Effect.gen(function* () {
    yield* useServerConfig()
    const workflow = yield* WorkflowService
    const parent = yield* createSession("workflow failure")
    const run = yield* workflow.start({
      sessionID: parent.id,
      script: `
export const meta = { name: 'broken', description: 'broken workflow' }
phase('Broken')
throw new Error('boom')
`,
      scriptDeadlineMs: 1_000,
    })

    const failed = yield* waitForTerminalRun(workflow, run.runID)
    expect(failed.status).toBe("failed")

    const journal = yield* workflow.getJournal(run.runID)
    expect(journal.some((entry) => entry.type === "error" && JSON.stringify(entry.data).includes("boom"))).toBe(true)
  }))

  it.instance("rejects scripts that try to access forbidden host globals", Effect.gen(function* () {
    yield* useServerConfig()
    const workflow = yield* WorkflowService
    const parent = yield* createSession("workflow unsafe")
    const run = yield* workflow.start({
      sessionID: parent.id,
      script: `
export const meta = { name: 'unsafe', description: 'unsafe workflow' }
return process.env
`,
      scriptDeadlineMs: 1_000,
    })

    const failed = yield* waitForTerminalRun(workflow, run.runID)
    expect(failed.status).toBe("failed")

    const journal = yield* workflow.getJournal(run.runID)
    expect(journal.some((entry) => entry.type === "error" && JSON.stringify(entry.data).includes("forbidden global"))).toBe(true)
  }))
})
