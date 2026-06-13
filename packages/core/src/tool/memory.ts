export * as MemoryTool from "./memory"

import { ToolFailure } from "@swust-code/llm"
import { Effect, Layer, Schema } from "effect"
import { Memory } from "../memory"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory"

export const Input = Schema.Struct({
  query: Schema.String.annotate({ description: "Search query - use 1-3 distinctive keywords" }),
  kind: Schema.optional(
    Schema.Literals(["global", "project", "session"]),
  ).annotate({ description: "Filter by memory kind (global/project/session)" }),
  limit: Schema.optional(Schema.Number).annotate({ description: "Max results to return (default 10)" }),
})

const Result = Schema.Struct({
  path: Schema.String,
  kind: Schema.String,
  scopeId: Schema.String,
  title: Schema.String,
  snippet: Schema.String,
  score: Schema.Number,
})

export const Output = Schema.Struct({
  results: Schema.Array(Result),
  total: Schema.Number,
})
export type Output = typeof Output.Type

function renderResults(output: Output): string {
  if (output.total === 0) {
    return [
      "No memory results found.",
      "",
      "Tips for better results:",
      "- Use fewer, more distinctive keywords",
      "- Try different search terms",
      "- Check if memory files exist under the memory directory",
    ].join("\n")
  }

  const lines: string[] = [`Found ${output.total} memory result(s):\n`]
  for (const r of output.results) {
    lines.push(`## ${r.title}`)
    lines.push(`- **Path**: ${r.path}`)
    lines.push(`- **Kind**: ${r.kind}${r.scopeId ? ` (${r.scopeId})` : ""}`)
    lines.push(`- **Score**: ${r.score.toFixed(2)}`)
    lines.push(`- **Snippet**: ${r.snippet}`)
    lines.push("")
  }
  lines.push("Read the full file path for complete context when relevant.")
  return lines.join("\n")
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const memory = yield* Memory.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: [
            "Search persistent project memory stored as markdown files.",
            "Memory files persist across sessions and contain project knowledge,",
            "architecture decisions, conventions, and learned patterns.",
            "Use 1-3 distinctive keywords for best results.",
            "Results are ranked by relevance (BM25 scoring).",
          ].join(" "),
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: renderResults(output) }],
          execute: (input, _context) =>
            Effect.gen(function* () {
              const results = yield* memory.search(input.query, {
                kind: input.kind,
                limit: input.limit,
              })
              return { results: [...results], total: results.length }
            }).pipe(
              Effect.mapError((e) => new ToolFailure({ message: `Memory search failed: ${e}` })),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)
