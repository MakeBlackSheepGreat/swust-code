import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { matchesActor } from "@/plugin/matcher"
import { SubagentProgressCheckerPlugin } from "@/plugin/subagent-progress-checker"
import { metaDir, progressPath, tasksDir } from "@/session/checkpoint-paths"
import { SessionID } from "@/session/schema"
import type { ActorMatcher } from "@swust-code/plugin"

async function withSession<T>(fn: (sessionID: SessionID) => Promise<T>): Promise<T> {
  const sid = SessionID.make(`ses_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  try {
    await fs.mkdir(tasksDir(sid), { recursive: true })
    return await fn(sid)
  } finally {
    await fs.rm(metaDir(sid), { recursive: true, force: true })
  }
}

async function hookRun() {
  const hooks = await SubagentProgressCheckerPlugin({} as never)
  const reg = hooks["actor.postStop"]
  if (!reg || typeof reg === "function") throw new Error("expected object form with run")
  return (reg as { run: (...args: any[]) => Promise<void> }).run
}

async function hookMatcher() {
  const hooks = await SubagentProgressCheckerPlugin({} as never)
  const reg = hooks["actor.postStop"]
  if (!reg || typeof reg === "function") throw new Error("expected matcher form")
  return (reg as { matcher?: ActorMatcher }).matcher
}

function makeInput(sessionID: SessionID, task_id?: string, canWrite?: boolean) {
  return {
    sessionID: sessionID as unknown as string,
    actorID: "actor-test",
    agentType: "explore",
    mode: "subagent" as const,
    lifecycle: "ephemeral" as const,
    task: "find error recovery",
    description: "Find error recovery",
    finalText: "(done)",
    outcome: "success" as const,
    iteration: 0,
    ...(task_id !== undefined ? { task_id } : {}),
    ...(canWrite !== undefined ? { canWrite } : {}),
  }
}

const FIVE_SECTION_BODY = [
  "## §1 Task identity",
  "- task_id: T7",
  "",
  "## §2 Subagent intent",
  "Do X.",
  "",
  "## §3 Files and code sections",
  "- a.ts: read",
  "",
  "## §4 Verbatim commands",
  "```",
  "ls",
  "```",
  "",
  "## §5 Outcome and discoveries",
  "- Outcome: success",
].join("\n")

describe("SubagentProgressCheckerPlugin postStop", () => {
  test("no task_id -> no-op", async () => {
    await withSession(async (sid) => {
      const output: { continue?: boolean; reason?: string } = {}
      await (await hookRun())(makeInput(sid, undefined), output)
      expect(output.continue).toBeUndefined()
      expect(output.reason).toBeUndefined()
    })
  })

  test("canWrite=false -> skip", async () => {
    await withSession(async (sid) => {
      const output: { continue?: boolean; reason?: string } = {}
      await (await hookRun())(makeInput(sid, "T4", false), output)
      expect(output.continue).toBeUndefined()
      expect(output.reason).toBeUndefined()
    })
  })

  test("canWrite=true -> nudges when file is missing", async () => {
    await withSession(async (sid) => {
      const output: { continue?: boolean; reason?: string } = {}
      await (await hookRun())(makeInput(sid, "T4", true), output)
      expect(output.continue).toBe(true)
      expect(output.reason).toContain(progressPath(sid, "T4"))
      expect(output.reason).toContain("## §1 Task identity")
      expect(output.reason).toContain("## §5 Outcome and discoveries")
    })
  })

  test("file exists with all 5 sections -> PASS and frontmatter injected", async () => {
    await withSession(async (sid) => {
      const fp = progressPath(sid, "T7")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await Bun.write(fp, FIVE_SECTION_BODY)

      const output: { continue?: boolean; reason?: string } = {}
      await (await hookRun())(makeInput(sid, "T7"), output)

      expect(output.continue).toBeUndefined()
      const after = await Bun.file(fp).text()
      expect(after.startsWith("---\nwritten-at: ")).toBe(true)
      expect(after).toContain("## §1 Task identity")
      expect(after).toContain("## §5 Outcome and discoveries")
    })
  })

  test("file exists missing a section -> continue=true and lists missing section", async () => {
    await withSession(async (sid) => {
      const fp = progressPath(sid, "T9")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await Bun.write(
        fp,
        [
          "## §1 Task identity",
          "- task_id: T9",
          "",
          "## §2 Subagent intent",
          "Do X.",
          "",
          "## §4 Verbatim commands",
          "```",
          "ls",
          "```",
          "",
          "## §5 Outcome and discoveries",
          "- Outcome: success",
        ].join("\n"),
      )

      const output: { continue?: boolean; reason?: string } = {}
      await (await hookRun())(makeInput(sid, "T9"), output)

      expect(output.continue).toBe(true)
      expect(output.reason).toContain("missing required sections")
      expect(output.reason).toContain("## §3 Files and code sections")
    })
  })

  test("frontmatter is idempotent", async () => {
    await withSession(async (sid) => {
      const fp = progressPath(sid, "T2")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await Bun.write(fp, FIVE_SECTION_BODY.replace("T7", "T2"))
      const run = await hookRun()

      await run(makeInput(sid, "T2"), {})
      const afterFirst = await Bun.file(fp).text()
      const firstMatch = afterFirst.match(/^---\nwritten-at: (\d+)\n---\n/)
      expect(firstMatch).not.toBeNull()

      await new Promise((resolve) => setTimeout(resolve, 5))
      await run(makeInput(sid, "T2"), {})
      const afterSecond = await Bun.file(fp).text()
      const secondMatch = afterSecond.match(/^---\nwritten-at: (\d+)\n---\n/)
      expect(secondMatch).not.toBeNull()
      expect(Number(secondMatch![1])).toBeGreaterThanOrEqual(Number(firstMatch![1]))
      expect(afterSecond.match(/^---/gm) ?? []).toHaveLength(2)
    })
  })
})

describe("SubagentProgressCheckerPlugin matcher", () => {
  test("fires for built-in task subagents and custom subagents", async () => {
    const matcher = await hookMatcher()
    for (const agentType of ["general", "explore", "build", "my-custom-reviewer"]) {
      expect(matchesActor(matcher, { mode: "subagent", agentType })).toBe(true)
    }
  })

  test("excludes internal agents that lack task_id semantics", async () => {
    const matcher = await hookMatcher()
    for (const agentType of ["checkpoint-writer", "title", "summary", "dream", "distill", "compaction", "main"]) {
      expect(matchesActor(matcher, { mode: "subagent", agentType })).toBe(false)
    }
  })
})
