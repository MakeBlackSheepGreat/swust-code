import { describe, expect, test } from "bun:test"
import { resolveRunAgent } from "@/cli/cmd/run"

describe("run goal agent routing", () => {
  test("uses the goal agent for --goal when --agent is omitted", () => {
    expect(resolveRunAgent(undefined, "finish the requested change")).toBe("goal")
  })

  test("keeps an explicitly selected agent over --goal", () => {
    expect(resolveRunAgent("build", "finish the requested change")).toBe("build")
    expect(resolveRunAgent("compose", "finish the requested change")).toBe("compose")
  })

  test("leaves normal runs on the default agent path", () => {
    expect(resolveRunAgent(undefined, undefined)).toBeUndefined()
  })
})
