import { Effect, Schema } from "effect"
import { Memory } from "@swust-code/core/memory/service"
import DESCRIPTION from "./memory.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  operation: Schema.optional(
    Schema.Literal("search").annotate({ description: "Memory operation to perform" }),
  ),
  query: Schema.String.annotate({ description: "Search query (BM25 over markdown bodies)" }),
  scope: Schema.optional(
    Schema.Literals(["global", "projects", "sessions", "cc"]).annotate({
      description: "Filter by memory scope",
    }),
  ),
  scope_id: Schema.optional(
    Schema.String.annotate({
      description: "Filter by scope id, for example a session id or project id",
    }),
  ),
  type: Schema.optional(
    Schema.String.annotate({
      description: "MiMo-compatible memory type filter; currently informational in SWUST",
    }),
  ),
  limit: Schema.optional(Schema.Number.annotate({ description: "Max results (default 10)" })),
})

type MemorySearchResult = {
  path: string
  kind: string
  scopeId: string
  title: string
  snippet: string
  score: number
}

function kindFromScope(scope: Schema.Schema.Type<typeof Parameters>["scope"]): "global" | "project" | "session" | undefined {
  switch (scope) {
    case "global":
      return "global"
    case "projects":
      return "project"
    case "sessions":
      return "session"
    case "cc":
    case undefined:
      return undefined
  }
}

function scopeFromKind(kind: string): string {
  switch (kind) {
    case "project":
      return "projects"
    case "session":
      return "sessions"
    default:
      return "global"
  }
}

function unsupportedNotes(input: Schema.Schema.Type<typeof Parameters>): string[] {
  const notes: string[] = []
  if (input.scope === "cc") {
    notes.push("Note: scope=\"cc\" is accepted for MiMo compatibility, but SWUST core does not index CC memory yet.")
  }
  if (input.type) {
    notes.push("Note: type filtering is accepted for MiMo compatibility, but SWUST core currently indexes kind/scope only.")
  }
  return notes
}

function renderNoResults(query: string, notes: string[]): string {
  return [
    `No matches for "${query}".`,
    "",
    ...notes,
    ...(notes.length ? [""] : []),
    "0 results does NOT mean it was never recorded. Escalate before giving up:",
    "1. Retry with FEWER / more distinctive terms - queries are OR-joined and",
    "   ranked, so 1-2 rare words (an exact ID, function name, flag) beat a long",
    '   descriptive phrase. Drop generic words ("config", "params", "database").',
    "2. For a LITERAL string the tokenizer splits (URLs, ports, paths, command flags) -",
    "   grep the memory directory directly; FTS cannot see the punctuation form.",
    "3. For VERBATIM recall of something a summary may have glossed over (exact",
    "   command, the user's precise wording) - use the history tool, which keeps",
    "   raw conversation messages.",
    "Widen scope progressively: session -> project -> global -> history.",
  ].join("\n")
}

function renderResults(results: MemorySearchResult[], notes: string[]): string {
  const lines = [
    `Found ${results.length} match${results.length === 1 ? "" : "es"} (BM25-ranked, best first).`,
    "A hit here is authoritative - use it even if a parallel/sibling query returned nothing.",
    "If you need the FULL body (snippets are truncated), Read the path.",
    "If you need an EXACT literal (a connection string, port, token, full command line, path) and the snippet/body only paraphrases or partially shows it, query the history tool for the original message.",
    "",
    ...notes,
    ...(notes.length ? [""] : []),
  ]

  for (const r of results) {
    const scope = scopeFromKind(r.kind)
    lines.push(`### ${r.path}`)
    lines.push(
      `Scope: ${scope}${r.scopeId ? `/${r.scopeId}` : ""}, Type: ${r.kind}, Score: ${r.score.toFixed(3)}`,
    )
    if (r.title) lines.push(`Title: ${r.title}`)
    lines.push(r.snippet)
    lines.push("")
  }
  return lines.join("\n")
}

export const MemoryTool = Tool.define<typeof Parameters, { count: number; unsupported?: string[] }, Memory.Service>(
  "memory",
  Effect.gen(function* () {
    const memory = yield* Memory.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: Schema.Schema.Type<typeof Parameters>) =>
        Effect.gen(function* () {
          if ((args.operation ?? "search") !== "search") {
            return yield* Effect.die(new Error(`Unsupported memory operation: ${args.operation}`))
          }

          const limit = Math.max(1, Math.min(args.limit ?? 10, 50))
          const kind = kindFromScope(args.scope)
          if (args.scope === "cc") {
            const notes = unsupportedNotes(args)
            return {
              title: "Memory search: 0 results",
              output: renderNoResults(args.query, notes),
              metadata: { count: 0, unsupported: notes },
            }
          }

          const searchLimit = args.scope_id ? Math.min(limit * 3, 50) : limit
          const raw = yield* memory.search(args.query, { kind, limit: searchLimit })
          const filtered = raw
            .filter((r) => (args.scope_id ? r.scopeId === args.scope_id : true))
            .slice(0, limit)
          const notes = unsupportedNotes(args)

          if (filtered.length === 0) {
            return {
              title: "Memory search: 0 results",
              output: renderNoResults(args.query, notes),
              metadata: { count: 0, unsupported: notes },
            }
          }

          return {
            title: `Memory search: ${filtered.length} result${filtered.length === 1 ? "" : "s"}`,
            output: renderResults(filtered, notes),
            metadata: { count: filtered.length, unsupported: notes },
          }
        }),
    }
  }),
)
