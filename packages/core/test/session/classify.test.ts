import { describe, test, expect } from "bun:test"
import { classifyStep, isTerminal, shouldRetry } from "../../src/session/classify"

describe("classifyStep", () => {
  test("pending tool calls → continue", () => {
    const result = classifyStep({
      hasError: false,
      hasText: true,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: true,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("continue")
  })

  test("no finish reason → continue", () => {
    const result = classifyStep({
      hasError: false,
      hasText: false,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("continue")
  })

  test("error → failed", () => {
    const result = classifyStep({
      finishReason: "stop",
      hasError: true,
      hasText: true,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("failed")
  })

  test("structured output → final", () => {
    const result = classifyStep({
      finishReason: "stop",
      hasError: false,
      hasText: true,
      hasStructuredOutput: true,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("final")
  })

  test("stop with text → final", () => {
    const result = classifyStep({
      finishReason: "stop",
      hasError: false,
      hasText: true,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("final")
  })

  test("length with text → final degraded", () => {
    const result = classifyStep({
      finishReason: "length",
      hasError: false,
      hasText: true,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("final")
    expect(result).toHaveProperty("degraded", true)
  })

  test("content-filter → filtered", () => {
    const result = classifyStep({
      finishReason: "content-filter",
      hasError: false,
      hasText: false,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("filtered")
  })

  test("reasoning only → think-only", () => {
    const result = classifyStep({
      finishReason: "stop",
      hasError: false,
      hasText: false,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: true,
    })
    expect(result.type).toBe("think-only")
  })

  test("empty output → invalid", () => {
    const result = classifyStep({
      finishReason: "stop",
      hasError: false,
      hasText: false,
      hasStructuredOutput: false,
      hasSummary: false,
      hasPendingToolCalls: false,
      hasReasoningOnly: false,
    })
    expect(result.type).toBe("invalid")
  })
})

describe("isTerminal", () => {
  test("final is terminal", () => expect(isTerminal({ type: "final" })).toBe(true))
  test("filtered is terminal", () => expect(isTerminal({ type: "filtered" })).toBe(true))
  test("continue is not terminal", () => expect(isTerminal({ type: "continue" })).toBe(false))
  test("failed is not terminal", () => expect(isTerminal({ type: "failed", reason: "" })).toBe(false))
})

describe("shouldRetry", () => {
  test("think-only should retry", () => expect(shouldRetry({ type: "think-only" })).toBe(true))
  test("invalid should retry", () => expect(shouldRetry({ type: "invalid", reason: "" })).toBe(true))
  test("final should not retry", () => expect(shouldRetry({ type: "final" })).toBe(false))
})
