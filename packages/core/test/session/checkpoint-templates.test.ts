import { describe, test, expect } from "bun:test"
import {
  CHECKPOINT_SECTION_BUDGETS,
  CHECKPOINT_TOTAL_BUDGET,
  MEMORY_SECTION_BUDGETS,
  MEMORY_TOTAL_BUDGET,
  COMPACTABLE_TOOL_NAMES,
  TAIL_MIN_TOKENS,
  TAIL_MAX_TOKENS,
} from "../../src/session/checkpoint-templates"

describe("checkpoint-templates", () => {
  test("checkpoint has 11 sections", () => {
    expect(Object.keys(CHECKPOINT_SECTION_BUDGETS).length).toBe(11)
  })

  test("checkpoint total budget is ~15K tokens", () => {
    expect(CHECKPOINT_TOTAL_BUDGET).toBeGreaterThan(10000)
    expect(CHECKPOINT_TOTAL_BUDGET).toBeLessThan(20000)
  })

  test("memory has 4 sections", () => {
    expect(Object.keys(MEMORY_SECTION_BUDGETS).length).toBe(4)
  })

  test("memory total budget is ~10K tokens", () => {
    expect(MEMORY_TOTAL_BUDGET).toBeGreaterThan(8000)
    expect(MEMORY_TOTAL_BUDGET).toBeLessThan(12000)
  })

  test("all section budgets are positive", () => {
    for (const [name, budget] of Object.entries(CHECKPOINT_SECTION_BUDGETS)) {
      expect(budget).toBeGreaterThan(0)
    }
    for (const [name, budget] of Object.entries(MEMORY_SECTION_BUDGETS)) {
      expect(budget).toBeGreaterThan(0)
    }
  })

  test("compactable tools include expected entries", () => {
    expect(COMPACTABLE_TOOL_NAMES.has("read")).toBe(true)
    expect(COMPACTABLE_TOOL_NAMES.has("bash")).toBe(true)
    expect(COMPACTABLE_TOOL_NAMES.has("edit")).toBe(true)
    expect(COMPACTABLE_TOOL_NAMES.has("grep")).toBe(true)
  })

  test("tail constants are reasonable", () => {
    expect(TAIL_MIN_TOKENS).toBeLessThan(TAIL_MAX_TOKENS)
    expect(TAIL_MIN_TOKENS).toBeGreaterThan(5000)
    expect(TAIL_MAX_TOKENS).toBeLessThan(30000)
  })
})
