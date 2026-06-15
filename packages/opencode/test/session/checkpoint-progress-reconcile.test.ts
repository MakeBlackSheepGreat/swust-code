import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import {
  buildProgressDiff,
  buildProgressDiffItems,
  parseReconciledMap,
  parseWrittenAt,
  renderProgressDiffBlock,
} from "../../src/session/checkpoint-progress-reconcile"
import { checkpointPath, metaDir, progressPath, tasksDir } from "../../src/session/checkpoint-paths"
import { SessionID } from "../../src/session/schema"

async function withSession<T>(fn: (sid: SessionID) => Promise<T>): Promise<T> {
  const sid = SessionID.make(`ses_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  try {
    await fs.mkdir(tasksDir(sid), { recursive: true })
    return await fn(sid)
  } finally {
    await fs.rm(metaDir(sid), { recursive: true, force: true })
  }
}

async function writeProgress(sid: SessionID, tid: string, body: string): Promise<void> {
  const fp = progressPath(sid, tid)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await Bun.write(fp, body)
}

async function writeMain(sid: SessionID, body: string): Promise<void> {
  const fp = checkpointPath(sid)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await Bun.write(fp, body)
}

describe("parseWrittenAt", () => {
  test("returns null when no frontmatter", () => {
    expect(parseWrittenAt("## §1 Task identity\n...\n")).toBeNull()
  })

  test("returns null when frontmatter lacks written-at", () => {
    expect(parseWrittenAt("---\nfoo: bar\n---\n## §1\n")).toBeNull()
  })

  test("returns number when present", () => {
    expect(parseWrittenAt("---\nwritten-at: 1717000050\n---\nbody")).toBe(1717000050)
  })

  test("returns null when value non-numeric", () => {
    expect(parseWrittenAt("---\nwritten-at: oops\n---\nbody")).toBeNull()
  })
})

describe("parseReconciledMap", () => {
  test("empty main returns empty map", () => {
    expect(parseReconciledMap("").size).toBe(0)
  })

  test("parses single section 4 marker", () => {
    const main =
      "## §4 Task tree\n" +
      "T4 type checker (progress: tasks/T4/progress.md, last-reconciled-written-at: 1717000050)\n"
    const m = parseReconciledMap(main)
    expect(m.get("T4")).toBe(1717000050)
  })

  test("parses multiple markers", () => {
    const main =
      "T1 a (progress: tasks/T1/progress.md, last-reconciled-written-at: 100)\n" +
      "T2 b (progress: tasks/T2/progress.md, last-reconciled-written-at: 200)\n"
    const m = parseReconciledMap(main)
    expect(m.get("T1")).toBe(100)
    expect(m.get("T2")).toBe(200)
  })

  test("ignores lines without full marker", () => {
    const main =
      "T1 a (progress: tasks/T1/progress.md)\n" +
      "T3 c (progress: tasks/T3/progress.md, last-reconciled-written-at: 300)\n"
    const m = parseReconciledMap(main)
    expect(m.size).toBe(1)
    expect(m.get("T3")).toBe(300)
  })
})

describe("renderProgressDiffBlock", () => {
  test("empty items returns empty string", () => {
    expect(renderProgressDiffBlock([])).toBe("")
  })

  test("single NEW item", () => {
    const out = renderProgressDiffBlock([{ taskId: "T4", writtenAt: 100, status: "NEW" }])
    expect(out).toContain("SUBAGENT PROGRESS to integrate")
    expect(out).toContain("T4 (NEW, written-at=100)")
  })

  test("CHANGED item shows prior", () => {
    const out = renderProgressDiffBlock([
      { taskId: "T4", writtenAt: 200, status: "CHANGED", prior: 100 },
    ])
    expect(out).toContain("T4 (CHANGED, written-at=200, prior=100)")
  })
})

describe("buildProgressDiffItems", () => {
  test("empty tasks dir returns no items", async () => {
    await withSession(async (sid) => {
      const items = await buildProgressDiffItems(sid)
      expect(items).toEqual([])
    })
  })

  test("single NEW when no section 4 marker exists in main checkpoint", async () => {
    await withSession(async (sid) => {
      await writeMain(sid, "## §4 Task tree\n(none)\n")
      await writeProgress(sid, "T4", "---\nwritten-at: 100\n---\n## §1\n")
      const items = await buildProgressDiffItems(sid)
      expect(items).toEqual([{ taskId: "T4", writtenAt: 100, status: "NEW" }])
    })
  })

  test("CHANGED when written-at is greater than prior marker", async () => {
    await withSession(async (sid) => {
      await writeMain(
        sid,
        "T4 a (progress: tasks/T4/progress.md, last-reconciled-written-at: 100)\n",
      )
      await writeProgress(sid, "T4", "---\nwritten-at: 200\n---\nbody")
      const items = await buildProgressDiffItems(sid)
      expect(items).toEqual([{ taskId: "T4", writtenAt: 200, status: "CHANGED", prior: 100 }])
    })
  })

  test("UNCHANGED when written-at is less than or equal to prior marker", async () => {
    await withSession(async (sid) => {
      await writeMain(
        sid,
        "T4 a (progress: tasks/T4/progress.md, last-reconciled-written-at: 100)\n",
      )
      await writeProgress(sid, "T4", "---\nwritten-at: 100\n---\nbody")
      const items = await buildProgressDiffItems(sid)
      expect(items).toEqual([])
    })
  })

  test("missing frontmatter is skipped", async () => {
    await withSession(async (sid) => {
      await writeMain(sid, "## §4 Task tree\n(none)\n")
      await writeProgress(sid, "T4", "## §1 Task identity\nno frontmatter\n")
      const items = await buildProgressDiffItems(sid)
      expect(items).toEqual([])
    })
  })

  test("mixed NEW, CHANGED, UNCHANGED, and skipped files", async () => {
    await withSession(async (sid) => {
      await writeMain(
        sid,
        "T2 (progress: tasks/T2/progress.md, last-reconciled-written-at: 50)\n" +
          "T3 (progress: tasks/T3/progress.md, last-reconciled-written-at: 200)\n",
      )
      await writeProgress(sid, "T1", "---\nwritten-at: 10\n---\nNEW")
      await writeProgress(sid, "T2", "---\nwritten-at: 100\n---\nCHANGED 50 to 100")
      await writeProgress(sid, "T3", "---\nwritten-at: 200\n---\nUNCHANGED")
      await writeProgress(sid, "T4", "## §1 no frontmatter\n")
      const items = await buildProgressDiffItems(sid)
      const sorted = [...items].sort((a, b) => a.taskId.localeCompare(b.taskId))
      expect(sorted).toEqual([
        { taskId: "T1", writtenAt: 10, status: "NEW" },
        { taskId: "T2", writtenAt: 100, status: "CHANGED", prior: 50 },
      ])
    })
  })
})

describe("buildProgressDiff", () => {
  test("empty when nothing to reconcile", async () => {
    await withSession(async (sid) => {
      expect(await buildProgressDiff(sid)).toBe("")
    })
  })

  test("renders block when items exist", async () => {
    await withSession(async (sid) => {
      await writeMain(sid, "## §4 Task tree\n(none)\n")
      await writeProgress(sid, "T4", "---\nwritten-at: 100\n---\nbody")
      const out = await buildProgressDiff(sid)
      expect(out).toContain("SUBAGENT PROGRESS to integrate")
      expect(out).toContain("T4 (NEW, written-at=100)")
    })
  })
})
