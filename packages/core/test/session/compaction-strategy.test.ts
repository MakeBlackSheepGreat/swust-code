import { describe, test, expect } from "bun:test"
import {
  computeBoundary,
  microcompact,
  computeLastMessageInfo,
  generateContinuityReminder,
  estimateTokens,
  type Message,
} from "../../src/session/compaction-strategy"

function makeMsg(role: Message["role"], content: string, opts?: Partial<Message>): Message {
  return { role, content, ...opts }
}

describe("computeBoundary", () => {
  test("empty messages returns zero boundary", () => {
    const result = computeBoundary([])
    expect(result.boundaryIndex).toBe(0)
    expect(result.tailTokens).toBe(0)
  })

  test("single message returns boundary at 0", () => {
    const msgs = [makeMsg("user", "hello")]
    const result = computeBoundary(msgs)
    expect(result.boundaryIndex).toBe(0)
  })

  test("short conversation preserves all", () => {
    const msgs = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "hi there"),
      makeMsg("user", "bye"),
    ]
    const result = computeBoundary(msgs)
    expect(result.boundaryIndex).toBe(0)
  })

  test("long conversation computes valid boundary", () => {
    // Create a conversation with enough content to exceed TAIL_MIN_TOKENS
    const longContent = "x".repeat(50000) // ~12500 tokens
    const msgs = [
      makeMsg("user", longContent),
      makeMsg("assistant", longContent),
      makeMsg("user", longContent),
      makeMsg("assistant", longContent),
    ]
    const result = computeBoundary(msgs)
    expect(result.boundaryIndex).toBeGreaterThanOrEqual(0)
    expect(result.boundaryIndex).toBeLessThan(msgs.length)
    expect(result.tailTokens).toBeGreaterThan(0)
  })
})

describe("microcompact", () => {
  test("preserves messages before boundary", () => {
    const msgs = [makeMsg("user", "hello"), makeMsg("assistant", "hi")]
    const result = microcompact(msgs, 1)
    expect(result[0].content).toBe("hello")
  })

  test("compacts bash tool results after boundary", () => {
    const msgs = [
      makeMsg("user", "run ls"),
      makeMsg("tool", "file1.txt\nfile2.txt", { toolName: "bash" }),
    ]
    const result = microcompact(msgs, 1)
    expect(result[1].content).toContain("compacted")
  })

  test("preserves non-compactable tool results", () => {
    const msgs = [
      makeMsg("user", "search memory"),
      makeMsg("tool", "found 3 results", { toolName: "memory" }),
    ]
    const result = microcompact(msgs, 1)
    expect(result[1].content).toBe("found 3 results")
  })

  test("preserves assistant messages", () => {
    const msgs = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "let me help"),
    ]
    const result = microcompact(msgs, 1)
    expect(result[1].content).toBe("let me help")
  })
})

describe("computeLastMessageInfo", () => {
  test("empty returns undefined", () => {
    expect(computeLastMessageInfo([])).toBeUndefined()
  })

  test("assistant with tool-calls", () => {
    const msgs = [makeMsg("assistant", "running tool", { finishReason: "tool-calls" })]
    const result = computeLastMessageInfo(msgs)
    expect(result?.role).toBe("assistant")
    expect((result as any)?.finish).toBe("tool-calls")
  })

  test("assistant with stop", () => {
    const msgs = [makeMsg("assistant", "done", { finishReason: "stop" })]
    const result = computeLastMessageInfo(msgs)
    expect(result?.role).toBe("assistant")
    expect((result as any)?.finish).toBe("stop")
  })

  test("tool message", () => {
    const msgs = [makeMsg("tool", "result")]
    expect(computeLastMessageInfo(msgs)?.role).toBe("tool")
  })

  test("user message", () => {
    const msgs = [makeMsg("user", "question")]
    expect(computeLastMessageInfo(msgs)?.role).toBe("user")
  })
})

describe("generateContinuityReminder", () => {
  test("no checkpoint summary returns empty", () => {
    const result = generateContinuityReminder(undefined)
    expect(result).toBe("")
  })

  test("with checkpoint summary adds framing", () => {
    const result = generateContinuityReminder(
      { role: "user" },
      "Previous context summary",
    )
    expect(result).toContain("checkpoint")
    expect(result).toContain("Resume directly")
  })

  test("tool-calls reminder for mid-loop", () => {
    const result = generateContinuityReminder(
      { role: "assistant", finish: "tool-calls" },
      "context",
    )
    expect(result).toContain("mid-loop")
  })

  test("stop reminder", () => {
    const result = generateContinuityReminder(
      { role: "assistant", finish: "stop" },
      "context",
    )
    expect(result).toContain("task checklist")
  })

  test("tool result reminder", () => {
    const result = generateContinuityReminder(
      { role: "tool" },
      "context",
    )
    expect(result).toContain("Process them and continue")
  })
})
