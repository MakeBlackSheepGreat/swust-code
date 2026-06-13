import { describe, test, expect } from "bun:test"
import { taskGate, isReEntryCapExceeded } from "../../src/session/task-gate"

describe("taskGate", () => {
  test("empty tasks returns no continue", () => {
    expect(taskGate([]).shouldContinue).toBe(false)
  })

  test("all completed returns no continue", () => {
    const tasks = [
      { content: "task 1", status: "completed" },
      { content: "task 2", status: "done" },
      { content: "task 3", status: "cancelled" },
    ]
    expect(taskGate(tasks).shouldContinue).toBe(false)
  })

  test("in-progress task forces continue", () => {
    const tasks = [
      { content: "fix bug in auth", status: "in_progress" },
      { content: "write tests", status: "completed" },
    ]
    const result = taskGate(tasks)
    expect(result.shouldContinue).toBe(true)
    expect(result.message).toContain("fix bug in auth")
    expect(result.message).toContain("1 incomplete")
  })

  test("pending task forces continue", () => {
    const tasks = [{ content: "deploy to prod", status: "pending" }]
    const result = taskGate(tasks)
    expect(result.shouldContinue).toBe(true)
    expect(result.message).toContain("deploy to prod")
  })

  test("multiple incomplete tasks counted", () => {
    const tasks = [
      { content: "task A", status: "in_progress" },
      { content: "task B", status: "pending" },
      { content: "task C", status: "completed" },
    ]
    const result = taskGate(tasks)
    expect(result.shouldContinue).toBe(true)
    expect(result.message).toContain("2 incomplete")
  })

  test("priority shown when present", () => {
    const tasks = [{ content: "critical fix", status: "in_progress", priority: "high" }]
    const result = taskGate(tasks)
    expect(result.message).toContain("[high]")
  })
})

describe("isReEntryCapExceeded", () => {
  test("0 is not exceeded", () => expect(isReEntryCapExceeded(0)).toBe(false))
  test("3 is not exceeded", () => expect(isReEntryCapExceeded(3)).toBe(false))
  test("13 is exceeded", () => expect(isReEntryCapExceeded(13)).toBe(true))
  test("100 is exceeded", () => expect(isReEntryCapExceeded(100)).toBe(true))
})
