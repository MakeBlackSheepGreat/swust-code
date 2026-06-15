import { Effect, Schema } from "effect"
import { History } from "@/history"
import DESCRIPTION from "./history.txt"
import * as Tool from "./tool"
import * as Truncate from "./truncate"
import { Agent } from "@/agent/agent"

const Kind = Schema.Literals([
  "user_text",
  "assistant_text",
  "tool_input",
  "tool_error",
  "reasoning",
  "tool_output",
])

const AROUND_MAX_BYTES = 20 * 1024

export const Parameters = Schema.Struct({
  operation: Schema.Literals(["search", "around"]).annotate({
    description: "search: FTS BM25; around: pull message context",
  }),
  query: Schema.optional(
    Schema.String.annotate({
      description: "FTS query over text/tool bodies. Required for operation=search.",
    }),
  ),
  scope: Schema.optional(
    Schema.Literals(["project", "global"]).annotate({
      description: "Default project. Use global to search all projects in this database.",
    }),
  ),
  session_id: Schema.optional(Schema.String.annotate({ description: "Filter search to one session id" })),
  kind: Schema.optional(Schema.Array(Kind).annotate({ description: "Filter search to part kinds" })),
  tool_name: Schema.optional(Schema.String.annotate({ description: "Filter to a specific tool name" })),
  time_after: Schema.optional(Schema.Number.annotate({ description: "Unix ms lower bound" })),
  time_before: Schema.optional(Schema.Number.annotate({ description: "Unix ms upper bound" })),
  limit: Schema.optional(Schema.Number.annotate({ description: "Max 50, default 10" })),
  message_id: Schema.optional(
    Schema.String.annotate({
      description: "Anchor message id. Required for operation=around.",
    }),
  ),
  before: Schema.optional(Schema.Number.annotate({ description: "Messages before anchor, default 5" })),
  after: Schema.optional(Schema.Number.annotate({ description: "Messages after anchor, default 5" })),
})

type Parameters = Schema.Schema.Type<typeof Parameters>

export const HistoryTool = Tool.define<
  typeof Parameters,
  { count: number; truncated?: boolean; outputPath?: string },
  History.Service | Truncate.Service | Agent.Service
>(
  "history",
  Effect.gen(function* () {
    const history = yield* History.Service
    const truncate = yield* Truncate.Service
    const agents = yield* Agent.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: Parameters, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (args.operation === "search") {
            if (!args.query) {
              return {
                title: "History search: missing query",
                output: "operation=search requires a `query` argument.",
                metadata: { count: 0 },
              }
            }

            const hits = yield* history.search({
              query: args.query,
              scope: args.scope,
              session_id: args.session_id,
              kind: args.kind ? [...args.kind] : undefined,
              tool_name: args.tool_name,
              time_after: args.time_after,
              time_before: args.time_before,
              limit: args.limit,
            })

            if (hits.length === 0) {
              return {
                title: "History search: 0 matches",
                output: `0 matches for "${args.query}". Try memory search if you have not, or broaden the query.`,
                metadata: { count: 0 },
              }
            }

            const lines = [`Found ${hits.length} match${hits.length === 1 ? "" : "es"}:`, ""]
            for (const hit of hits) {
              const kindLabel = hit.tool_name ? `${hit.kind} - ${hit.tool_name}` : hit.kind
              lines.push(`### ${hit.session_id} ${hit.message_id}  (${kindLabel})`)
              lines.push(`Time: ${new Date(hit.time_created).toISOString()}, Score: ${hit.score.toFixed(3)}`)
              lines.push(hit.snippet)
              lines.push("")
            }

            return {
              title: `History search: ${hits.length} match${hits.length === 1 ? "" : "es"}`,
              output: lines.join("\n"),
              metadata: { count: hits.length },
            }
          }

          if (!args.message_id) {
            return {
              title: "History around: missing message_id",
              output: "operation=around requires a `message_id` argument.",
              metadata: { count: 0 },
            }
          }

          const around = yield* history.around({
            message_id: args.message_id,
            before: args.before,
            after: args.after,
          })

          if (around.messages.length === 0) {
            return {
              title: "History around: anchor not found",
              output: `No message with id ${args.message_id}.`,
              metadata: { count: 0 },
            }
          }

          const lines = [
            `Session ${around.session_id}, ${around.messages.length} messages (anchor ${args.message_id}):`,
            "",
          ]
          for (const message of around.messages) {
            const prefix = message.matched ? ">>>" : "---"
            lines.push(`${prefix} ${message.message_id} (${new Date(message.time_created).toISOString()})`)
            for (const part of message.parts) {
              const head = part.tool_name ? `${part.type} (${part.tool_name})` : part.type
              lines.push(`  ${part.role} - ${head}:`)
              lines.push(part.text.split("\n").map((line) => `    ${line}`).join("\n"))
            }
            lines.push("")
          }

          const agent = yield* agents.get(ctx.agent)
          const truncated = yield* truncate.output(lines.join("\n"), { maxBytes: AROUND_MAX_BYTES }, agent)
          return {
            title: `History around ${args.message_id}`,
            output: truncated.content,
            metadata: {
              count: around.messages.length,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: truncated.outputPath }),
            },
          }
        }),
    }
  }),
)
