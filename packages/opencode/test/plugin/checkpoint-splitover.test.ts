import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import type { ActorMatcher, ActorPreStopInput, ActorStopOutput, PluginInput } from "@swust-code/plugin"
import type { ID as ProjectID } from "@swust-code/core/project"
import { CheckpointSplitoverPlugin } from "@/plugin/checkpoint-splitover"
import { matchesActor } from "@/plugin/matcher"
import * as CheckpointContext from "@/session/checkpoint-context"
import { checkpointPath, memoryPath, metaDir } from "@/session/checkpoint-paths"
import type { SessionID } from "@/session/schema"

afterEach(() => {
  CheckpointContext._reset()
})

function tmpSessionID(): SessionID {
  return `ses_test_${Math.random().toString(36).slice(2, 10)}` as SessionID
}

function tmpProjectID(): ProjectID {
  return `proj_test_${Math.random().toString(36).slice(2, 10)}` as ProjectID
}

function fakeInput(projectID: ProjectID): PluginInput {
  return {
    client: {},
    project: { id: projectID },
    directory: "",
    worktree: "",
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://localhost:4096"),
    $: undefined,
  } as unknown as PluginInput
}

function fakeStopInput(sessionID: SessionID): ActorPreStopInput {
  return {
    sessionID,
    actorID: "act_test",
    agentType: "checkpoint-writer",
    mode: "subagent",
    lifecycle: "ephemeral",
    task: "checkpoint",
    iteration: 0,
  }
}

async function setupSession(sessionID: SessionID, projectID: ProjectID): Promise<void> {
  await fs.mkdir(metaDir(sessionID), { recursive: true })
  await fs.mkdir(path.dirname(memoryPath(projectID)), { recursive: true })
}

const CLEAN_CHECKPOINT = `Topic: clean test checkpoint

### Execution context
(none)

### Live resources
(none)

### Session metadata
(none)

### Discovered
(none)

### Dead ends
(none)
`

const CLEAN_MEMORY = `## Rules
short rule
`

describe("CheckpointSplitoverPlugin", () => {
  test("clean checkpoint -> no reentry", async () => {
    const sessionID = tmpSessionID()
    const projectID = tmpProjectID()
    await setupSession(sessionID, projectID)
    await fs.writeFile(checkpointPath(sessionID), CLEAN_CHECKPOINT)
    await fs.writeFile(memoryPath(projectID), CLEAN_MEMORY)

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run(fakeStopInput(sessionID), output)

    expect(output.continue).toBeUndefined()
    expect(output.reason).toBeUndefined()
  })

  test("extract-required -> buildExtractionReflection in reason", async () => {
    const sessionID = tmpSessionID()
    const projectID = tmpProjectID()
    await setupSession(sessionID, projectID)
    const oversized = "## §1 Active intent\n" + "x ".repeat(3000) + "\n"
    await fs.writeFile(checkpointPath(sessionID), oversized)
    await fs.writeFile(memoryPath(projectID), "## Rules\nok\n")

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run(fakeStopInput(sessionID), output)

    expect(output.continue).toBe(true)
    expect(output.reason).toContain("EXTRACTION REQUIRED")
    expect(output.reason).toContain("spillover")
  })

  test("regular error -> buildReflectionMessage in reason", async () => {
    const sessionID = tmpSessionID()
    const projectID = tmpProjectID()
    await setupSession(sessionID, projectID)
    await fs.writeFile(checkpointPath(sessionID), "")
    await fs.writeFile(memoryPath(projectID), "## Rules\nshort\n")

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run(fakeStopInput(sessionID), output)

    expect(output.continue).toBe(true)
    expect(output.reason).toContain("<system-reminder>")
    expect(output.reason).toContain("CHECKPOINT_PATH = ")
    expect(output.reason).toContain("MEMORY_PATH     = ")
  })

  test("warn-only -> no reentry", async () => {
    const sessionID = tmpSessionID()
    const projectID = tmpProjectID()
    await setupSession(sessionID, projectID)
    const longTopic = "a".repeat(120)
    const warnOnlyCheckpoint =
      `Topic: ${longTopic}\n` +
      "\n" +
      "### Execution context\n(none)\n\n" +
      "### Live resources\n(none)\n\n" +
      "### Session metadata\n(none)\n\n" +
      "### Discovered\n(none)\n\n" +
      "### Dead ends\n(none)\n"
    await fs.writeFile(checkpointPath(sessionID), warnOnlyCheckpoint)
    await fs.writeFile(memoryPath(projectID), "## Rules\nshort\n")

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run(fakeStopInput(sessionID), output)

    expect(output.continue).toBeUndefined()
    expect(output.reason).toBeUndefined()
  })

  test("matcher includes checkpoint-writer and excludes other agents", async () => {
    const hooks = await CheckpointSplitoverPlugin(fakeInput(tmpProjectID()))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")
    const matcher: ActorMatcher | undefined = reg.matcher

    expect(matchesActor(matcher, { mode: "subagent", agentType: "checkpoint-writer" })).toBe(true)
    for (const agentType of ["general", "build", "summary", "custom"]) {
      expect(matchesActor(matcher, { mode: "subagent", agentType })).toBe(false)
    }
  })

  test("CheckpointContext entry with priorTitles catches duplicate-title", async () => {
    const sessionID = tmpSessionID()
    const projectID = tmpProjectID()
    const actorID = "act_dup"
    await setupSession(sessionID, projectID)
    CheckpointContext.set(sessionID, actorID, {
      priorTitles: new Set(["Reuse Bun.file() not fs.readFile"]),
      expectedRevisions: [],
    })
    const dupCheckpoint = `Topic: writer-output

### Discovered
- Reuse Bun.file() not fs.readFile
  Why: faster
  How to apply: replace fs.readFile sites

### Dead ends
(none)
`
    await fs.writeFile(checkpointPath(sessionID), dupCheckpoint)
    await fs.writeFile(memoryPath(projectID), "## Rules\nx\n")

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run({ ...fakeStopInput(sessionID), actorID }, output)

    expect(output.continue).toBe(true)
    expect(output.reason).toContain("<system-reminder>")
    expect(output.reason).toContain("duplicates a prior checkpoint")
    expect(output.reason).toContain("Reuse Bun.file() not fs.readFile")
  })

  test("parentSessionID fallback reads parent checkpoint and context", async () => {
    const parentID = tmpSessionID()
    const childID = tmpSessionID()
    const projectID = tmpProjectID()
    const actorID = "act_dup_child"
    await setupSession(parentID, projectID)
    CheckpointContext.set(parentID, actorID, {
      priorTitles: new Set(["Reuse Bun.file() not fs.readFile"]),
      expectedRevisions: [],
    })
    const dupCheckpoint = `Topic: writer-output

### Discovered
- Reuse Bun.file() not fs.readFile
  Why: faster
  How to apply: replace fs.readFile sites

### Dead ends
(none)
`
    await fs.writeFile(checkpointPath(parentID), dupCheckpoint)
    await fs.writeFile(memoryPath(projectID), CLEAN_MEMORY)

    const hooks = await CheckpointSplitoverPlugin(fakeInput(projectID))
    const reg = hooks["actor.preStop"]
    if (!reg || typeof reg === "function") throw new Error("expected registration object")

    const output: ActorStopOutput = {}
    await reg.run({ ...fakeStopInput(childID), actorID, parentSessionID: parentID }, output)

    expect(output.continue).toBe(true)
    expect(output.reason).toContain("duplicates a prior checkpoint")
  })
})
