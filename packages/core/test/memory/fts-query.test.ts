import { describe, test, expect } from "bun:test"
import { tokenize, buildFtsQuery, applyScoreFloor } from "../../src/memory/fts-query"

describe("tokenize", () => {
  test("splits whitespace and filters short tokens", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"])
  })

  test("filters tokens shorter than 2 chars", () => {
    expect(tokenize("a bb c ddd")).toEqual(["bb", "ddd"])
  })

  test("handles unicode CJK", () => {
    const tokens = tokenize("数据库 design 模式")
    expect(tokens).toContain("数据库")
    expect(tokens).toContain("design")
    expect(tokens).toContain("模式")
  })

  test("strips punctuation", () => {
    expect(tokenize("hello-world.foo/bar")).toEqual(["hello", "world", "foo", "bar"])
  })

  test("lowercases tokens", () => {
    expect(tokenize("Hello WORLD")).toEqual(["hello", "world"])
  })

  test("empty input returns empty array", () => {
    expect(tokenize("")).toEqual([])
    expect(tokenize("   ")).toEqual([])
  })
})

describe("buildFtsQuery", () => {
  test("joins tokens with OR", () => {
    expect(buildFtsQuery("hello world")).toBe('"hello" OR "world"')
  })

  test("returns null for empty query", () => {
    expect(buildFtsQuery("")).toBeNull()
    expect(buildFtsQuery("   ")).toBeNull()
  })

  test("wraps each token in quotes", () => {
    expect(buildFtsQuery("test")).toBe('"test"')
  })
})

describe("applyScoreFloor", () => {
  test("returns empty for empty input", () => {
    expect(applyScoreFloor([], 0.15, 10)).toEqual([])
  })

  test("always keeps first result", () => {
    const results = [
      { path: "a.md", kind: "project" as const, scopeId: "", title: "A", snippet: "", score: 10 },
      { path: "b.md", kind: "project" as const, scopeId: "", title: "B", snippet: "", score: 0.01 },
    ]
    const filtered = applyScoreFloor(results, 0.15, 10)
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    expect(filtered[0].path).toBe("a.md")
  })

  test("filters by floor ratio", () => {
    const results = [
      { path: "a.md", kind: "project" as const, scopeId: "", title: "A", snippet: "", score: 10 },
      { path: "b.md", kind: "project" as const, scopeId: "", title: "B", snippet: "", score: 2 },
      { path: "c.md", kind: "project" as const, scopeId: "", title: "C", snippet: "", score: 0.1 },
    ]
    const filtered = applyScoreFloor(results, 0.15, 10)
    expect(filtered.length).toBe(2)
  })

  test("respects limit", () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      path: `${i}.md`,
      kind: "project" as const,
      scopeId: "",
      title: `${i}`,
      snippet: "",
      score: 10 - i * 0.1,
    }))
    const filtered = applyScoreFloor(results, 0, 5)
    expect(filtered.length).toBe(5)
  })
})
