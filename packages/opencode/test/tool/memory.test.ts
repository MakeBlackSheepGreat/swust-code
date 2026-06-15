import { beforeEach, describe, expect } from "bun:test"
import { Effect, Layer, Result, Schema } from "effect"
import { Memory } from "@swust-code/core/memory/service"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { MemoryTool, Parameters } from "@/tool/memory"
import { ToolJsonSchema } from "@/tool/json-schema"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"

type SearchCall = {
  query: string
  opts?: { readonly limit?: number; readonly kind?: string }
}

let calls: SearchCall[] = []

const fakeMemoryLayer = Layer.succeed(
  Memory.Service,
  Memory.Service.of({
    search: (query, opts) =>
      Effect.sync(() => {
        calls.push({ query, opts })
        if (query === "JWT") {
          return [
            {
              path: "/memory/projects/p1/auth.md",
              kind: "project" as const,
              scopeId: "p1",
              title: "Auth notes",
              snippet: "JWT signing notes",
              score: 3.25,
            },
          ]
        }
        if (query === "filter") {
          return [
            {
              path: "/memory/projects/p1/first.md",
              kind: "project" as const,
              scopeId: "p1",
              title: "First",
              snippet: "first project memory",
              score: 4,
            },
            {
              path: "/memory/projects/p2/second.md",
              kind: "project" as const,
              scopeId: "p2",
              title: "Second",
              snippet: "second project memory",
              score: 3,
            },
          ]
        }
        return []
      }),
    write: () => Effect.succeed("/memory/projects/p1/file.md"),
    saveFact: () => Effect.succeed("/memory/projects/p1/facts/fact.md"),
    listFacts: () => Effect.succeed([]),
    reconcile: () => Effect.void,
    root: () => "/memory",
  }),
)

const it = testEffect(Layer.mergeAll(fakeMemoryLayer, Truncate.defaultLayer, Agent.defaultLayer))

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.ascending(),
  agent: "build",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

beforeEach(() => {
  calls = []
})

describe("memory tool", () => {
  it.effect("accepts the MiMo-compatible search parameters", () =>
    Effect.sync(() => {
      expect(
        Result.isSuccess(
          Schema.decodeUnknownResult(Parameters)({
            operation: "search",
            query: "JWT",
            scope: "projects",
            scope_id: "p1",
            type: "pinned",
            limit: 5,
          }),
        ),
      ).toBe(true)

      expect(Result.isSuccess(Schema.decodeUnknownResult(Parameters)({ query: "JWT", scope: "bad" }))).toBe(false)
      expect(ToolJsonSchema.fromSchema(Parameters).properties).toMatchObject({
        operation: expect.any(Object),
        query: expect.any(Object),
        scope: expect.any(Object),
        scope_id: expect.any(Object),
        type: expect.any(Object),
        limit: expect.any(Object),
      })
    }),
  )

  it.instance("search operation returns MiMo-style formatted results", () =>
    Effect.gen(function* () {
      const info = yield* MemoryTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ operation: "search", query: "JWT" }, ctx)

      expect(result.title).toBe("Memory search: 1 result")
      expect(result.metadata.count).toBe(1)
      expect(result.output).toContain("Found 1 match")
      expect(result.output).toContain("A hit here is authoritative")
      expect(result.output).toContain("### /memory/projects/p1/auth.md")
      expect(result.output).toContain("Scope: projects/p1, Type: project, Score: 3.250")
      expect(result.output).toContain("Title: Auth notes")
      expect(result.output).toContain("JWT signing notes")
    }),
  )

  it.instance("empty search returns the MiMo zero-result escalation guidance", () =>
    Effect.gen(function* () {
      const info = yield* MemoryTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ operation: "search", query: "missing" }, ctx)

      expect(result.title).toBe("Memory search: 0 results")
      expect(result.metadata.count).toBe(0)
      expect(result.output).toContain('No matches for "missing".')
      expect(result.output).toContain("0 results does NOT mean it was never recorded")
      expect(result.output).toContain("Retry with FEWER / more distinctive terms")
      expect(result.output).toContain("Widen scope progressively: session -> project -> global -> history.")
    }),
  )

  it.instance("maps MiMo projects scope to SWUST project kind and filters scope_id", () =>
    Effect.gen(function* () {
      const info = yield* MemoryTool
      const tool = yield* info.init()
      const result = yield* tool.execute(
        { operation: "search", query: "filter", scope: "projects", scope_id: "p2", limit: 1 },
        ctx,
      )

      expect(calls).toEqual([{ query: "filter", opts: { kind: "project", limit: 3 } }])
      expect(result.metadata.count).toBe(1)
      expect(result.output).toContain("### /memory/projects/p2/second.md")
      expect(result.output).not.toContain("### /memory/projects/p1/first.md")
    }),
  )

  it.instance("accepts cc and type for MiMo compatibility without inventing unsupported results", () =>
    Effect.gen(function* () {
      const info = yield* MemoryTool
      const tool = yield* info.init()
      const result = yield* tool.execute({ operation: "search", query: "feedback", scope: "cc", type: "feedback" }, ctx)

      expect(calls).toEqual([])
      expect(result.metadata.count).toBe(0)
      expect(result.metadata.unsupported).toEqual([
        'Note: scope="cc" is accepted for MiMo compatibility, but SWUST core does not index CC memory yet.',
        "Note: type filtering is accepted for MiMo compatibility, but SWUST core currently indexes kind/scope only.",
      ])
      expect(result.output).toContain('scope="cc" is accepted for MiMo compatibility')
      expect(result.output).toContain("type filtering is accepted for MiMo compatibility")
    }),
  )
})
