export * as History from "./service"

import { Context, Effect, Layer } from "effect"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { LayerNode } from "@swust-code/core/effect/layer-node"
import { MessageTable, PartTable } from "@swust-code/core/session/sql"
import type { SessionV1 } from "@swust-code/core/v1/session"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { backfillWith, layer as backfillLayer } from "./backfill"
import { buildFtsQuery } from "./fts-query"
import type { Kind } from "./extract"
import { layer as writerLayer } from "./writer"

export type SearchHit = {
  part_id: string
  session_id: string
  message_id: string
  project_id: string
  kind: Kind
  tool_name: string | null
  snippet: string
  score: number
  time_created: number
}

export type MessagePart = {
  part_id: string
  type: string
  role: "user" | "assistant"
  tool_name: string | null
  text: string
}

export type MessageContext = {
  message_id: string
  matched: boolean
  time_created: number
  parts: MessagePart[]
}

export interface Interface {
  readonly search: (input: {
    query: string
    scope?: "project" | "global"
    session_id?: string
    kind?: Kind | Kind[]
    tool_name?: string
    time_after?: number
    time_before?: number
    limit?: number
  }) => Effect.Effect<SearchHit[]>

  readonly around: (input: {
    message_id: string
    before?: number
    after?: number
  }) => Effect.Effect<{ session_id: string; messages: MessageContext[] }>

  readonly backfill: (input?: { session_id?: string; limit?: number }) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/History") {}

const HARD_CAP = 50
const BACKFILL_BATCH = 5000

type SearchRow = {
  part_id: string
  session_id: string
  message_id: string
  project_id: string
  kind: string
  tool_name: string | null
  snippet: string
  score: number
  time_created: number
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return String(value ?? "")
  }
}

function renderPartText(part: SessionV1.Part): { text: string; toolName: string | null } {
  switch (part.type) {
    case "text":
    case "reasoning":
      return { text: part.text, toolName: null }
    case "tool": {
      const state = part.state
      const text =
        state.status === "pending" || state.status === "running"
          ? `tool: ${part.tool}\ninput: ${stringify(state.input)}`
          : state.status === "error"
            ? `tool: ${part.tool}\ninput: ${stringify(state.input)}\nerror: ${state.error}`
            : `tool: ${part.tool}\ninput: ${stringify(state.input)}\noutput: ${state.output}`
      return { text, toolName: part.tool }
    }
    case "file":
      return { text: `[file ${part.mime}${part.filename ? ` ${part.filename}` : ""}]`, toolName: null }
    case "subtask":
      return { text: `subtask: ${part.description}\n${part.prompt}`, toolName: null }
    case "compaction":
      return { text: "[compaction marker]", toolName: null }
    default:
      return { text: `[${part.type}]`, toolName: null }
  }
}

function asRole(data: unknown): "user" | "assistant" {
  return typeof data === "object" && data !== null && "role" in data && data.role === "user" ? "user" : "assistant"
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const backfill = Effect.fn("History.backfill")((input?: { session_id?: string; limit?: number }) =>
      backfillWith(db, input),
    )

    const search = Effect.fn("History.search")(function* (input: Parameters<Interface["search"]>[0]) {
      const ftsQuery = buildFtsQuery(input.query)
      if (!ftsQuery) return []

      yield* backfill({ session_id: input.session_id, limit: BACKFILL_BATCH })

      const limit = Math.max(1, Math.min(input.limit ?? 10, HARD_CAP))
      let query = sql`
        SELECT h.part_id, h.session_id, h.message_id, h.project_id, h.kind, h.tool_name,
               h.time_created,
               snippet(history_fts_idx, 0, '<<', '>>', '...', 32) AS snippet,
               -bm25(history_fts_idx) AS score
        FROM history_fts_idx
        JOIN history_fts h ON h.rowid = history_fts_idx.rowid
        WHERE history_fts_idx MATCH ${ftsQuery}
      `

      if ((input.scope ?? "project") === "project") {
        const ctx = yield* InstanceState.context
        query = sql`${query} AND h.project_id = ${ctx.project.id}`
      }
      if (input.session_id) query = sql`${query} AND h.session_id = ${input.session_id}`
      if (input.kind) {
        const kinds = Array.isArray(input.kind) ? input.kind : [input.kind]
        query = sql`${query} AND h.kind IN (${sql.join(kinds.map((kind) => sql`${kind}`), sql`, `)})`
      }
      if (input.tool_name) query = sql`${query} AND h.tool_name = ${input.tool_name}`
      if (input.time_after !== undefined) query = sql`${query} AND h.time_created >= ${input.time_after}`
      if (input.time_before !== undefined) query = sql`${query} AND h.time_created <= ${input.time_before}`

      query = sql`${query} ORDER BY bm25(history_fts_idx) LIMIT ${limit}`

      const rows = yield* db.all<SearchRow>(query).pipe(Effect.catch(() => Effect.succeed([] as SearchRow[])))
      return rows.map((row) => ({
        part_id: row.part_id,
        session_id: row.session_id,
        message_id: row.message_id,
        project_id: row.project_id,
        kind: row.kind as Kind,
        tool_name: row.tool_name,
        snippet: row.snippet,
        score: row.score,
        time_created: row.time_created,
      }))
    })

    const around = Effect.fn("History.around")(function* (input: Parameters<Interface["around"]>[0]) {
      const before = Math.max(0, Math.min(input.before ?? 5, 50))
      const after = Math.max(0, Math.min(input.after ?? 5, 50))
      const anchor = yield* db
        .select({
          id: MessageTable.id,
          sessionID: MessageTable.session_id,
          timeCreated: MessageTable.time_created,
        })
        .from(MessageTable)
        .where(eq(MessageTable.id, input.message_id as never))
        .get()
        .pipe(Effect.orDie)

      if (!anchor) return { session_id: "", messages: [] }

      const beforeRows = yield* db
        .select()
        .from(MessageTable)
        .where(
          and(
            eq(MessageTable.session_id, anchor.sessionID),
            sql`(${MessageTable.time_created} < ${anchor.timeCreated} OR (${MessageTable.time_created} = ${anchor.timeCreated} AND ${MessageTable.id} <= ${anchor.id}))`,
          ),
        )
        .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
        .limit(before + 1)
        .all()
        .pipe(Effect.orDie)

      const afterRows = yield* db
        .select()
        .from(MessageTable)
        .where(
          and(
            eq(MessageTable.session_id, anchor.sessionID),
            sql`(${MessageTable.time_created} > ${anchor.timeCreated} OR (${MessageTable.time_created} = ${anchor.timeCreated} AND ${MessageTable.id} > ${anchor.id}))`,
          ),
        )
        .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
        .limit(after)
        .all()
        .pipe(Effect.orDie)

      const messages = [...beforeRows.reverse(), ...afterRows]
      if (messages.length === 0) return { session_id: anchor.sessionID, messages: [] }

      const parts = yield* db
        .select()
        .from(PartTable)
        .where(inArray(PartTable.message_id, messages.map((message) => message.id)))
        .orderBy(asc(PartTable.message_id), asc(PartTable.id))
        .all()
        .pipe(Effect.orDie)

      const byMessage = new Map<string, typeof parts>()
      for (const part of parts) {
        const list = byMessage.get(part.message_id) ?? []
        list.push(part)
        byMessage.set(part.message_id, list)
      }

      return {
        session_id: anchor.sessionID,
        messages: messages.map((message) => {
          const role = asRole(message.data)
          return {
            message_id: message.id,
            matched: message.id === input.message_id,
            time_created: message.time_created,
            parts: (byMessage.get(message.id) ?? []).map((row) => {
              const part = {
                ...row.data,
                id: row.id,
                sessionID: row.session_id,
                messageID: row.message_id,
              } as SessionV1.Part
              const rendered = renderPartText(part)
              return {
                part_id: row.id,
                type: part.type,
                role,
                tool_name: rendered.toolName,
                text: rendered.text,
              }
            }),
          }
        }),
      }
    })

    return Service.of({ search, around, backfill })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  Layer.mergeAll(layer, writerLayer, backfillLayer).pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(EventV2Bridge.defaultLayer),
    Layer.provide(Database.defaultLayer),
  ),
)

export const node = LayerNode.make(defaultLayer, [])
