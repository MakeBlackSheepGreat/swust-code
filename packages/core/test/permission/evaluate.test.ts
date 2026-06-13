import { describe, test, expect } from "bun:test"
import { evaluatePermission } from "../../src/permission/evaluate"

describe("evaluatePermission", () => {
  const baseCtx = {
    toolName: "bash",
    input: {},
    mode: "default" as const,
    rules: [],
    isReadOnly: false,
    isDestructive: true,
  }

  test("blanket deny rule takes priority", () => {
    const result = evaluatePermission({
      ...baseCtx,
      rules: [{ tool: "bash", decision: "deny", source: "policy" }],
    })
    expect(result.decision).toBe("deny")
  })

  test("blanket ask rule returns ask", () => {
    const result = evaluatePermission({
      ...baseCtx,
      rules: [{ tool: "bash", decision: "ask", source: "user" }],
    })
    expect(result.decision).toBe("ask")
  })

  test("bypass mode allows all", () => {
    const result = evaluatePermission({
      ...baseCtx,
      mode: "bypass",
    })
    expect(result.decision).toBe("allow")
  })

  test("read-only tool auto-allows in default mode", () => {
    const result = evaluatePermission({
      ...baseCtx,
      toolName: "read",
      isReadOnly: true,
      isDestructive: false,
    })
    expect(result.decision).toBe("allow")
  })

  test("write tool asks in default mode", () => {
    const result = evaluatePermission({
      ...baseCtx,
      toolName: "write",
      isReadOnly: false,
      isDestructive: false,
    })
    expect(result.decision).toBe("ask")
  })

  test("dontAsk mode denies unknown tools", () => {
    const result = evaluatePermission({
      ...baseCtx,
      mode: "dontAsk",
    })
    expect(result.decision).toBe("deny")
  })

  test("dangerous bash command is denied", () => {
    const result = evaluatePermission({
      ...baseCtx,
      isBashCommand: "rm -rf /",
    })
    expect(result.decision).toBe("deny")
  })

  test("safe bash command passes", () => {
    const result = evaluatePermission({
      ...baseCtx,
      isReadOnly: true,
      isDestructive: false,
      isBashCommand: "ls -la",
    })
    expect(result.decision).toBe("allow")
  })
})
