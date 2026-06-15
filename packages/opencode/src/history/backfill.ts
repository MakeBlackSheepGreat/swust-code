import { Context, Effect, Layer } from "effect"
import { and, asc, desc, eq, gt, sql } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { PartTable, SessionTable } from "@swust-code/core/session/sql"
import type { ConfigV1 } from "@swust-code/core/v1/config/config"
import type { SessionV1 } from "@swust-code/core/v1/session"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { DEFAULT_KINDS, extract, type Kind } from "./extract"
import { HistoryFtsTable } from "./fts.sql"
import { makeResolver, type Resolver } from "./resolve"

const BATCH = 500

export interface BackfillInput {
  readonly session_id?: string
  readonly limit?: number
}

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly backfill: (input?: BackfillInput) => Effect.Effect<number>
}

export class BackfillService extends Context.Service<BackfillService, Interface>()(
  "@swust-code/History.Backfill",
) {}

function enabledKinds(config: ConfigV1.Info): ReadonlySet<Kind> {
  return new Set((config.history?.kinds ?? DEFAULT_KINDS) as readonly Kind[])
}

export const backfillMissing = Effect.fn("History.Backfill.missing")(function* (
  input?: BackfillInput,
  enabled: ReadonlySet<Kind> = new Set(DEFAULT_KINDS),
) {
  const database = yield* Database.Service
  return yield* backfillWith(database.db, input, enabled)
})

export const backfillWith = Effect.fn("History.Backfill.withDatabase")(function* (
  db: Database.Interface["db"],
  input?: BackfillInput,
  enabled: ReadonlySet<Kind> = new Set(DEFAULT_KINDS),
) {
  if (enabled.size === 0) return 0

  const resolver = makeResolver(db)
  const sessionQuery = db.select({ id: SessionTable.id, project_id: SessionTable.project_id }).from(SessionTable)
  const sessions = yield* (input?.session_id
    ? sessionQuery.where(eq(SessionTable.id, input.session_id as never)).all()
    : sessionQuery.orderBy(desc(SessionTable.time_updated)).all()
  ).pipe(Effect.orDie)

  let total = 0
  let remaining = input?.limit ?? Number.POSITIVE_INFINITY
  for (const session of sessions) {
    if (remaining <= 0) break
    const written = yield* scanSession(db, session, resolver, enabled, remaining)
    total += written
    remaining -= written
    if (!input?.session_id) yield* Effect.sleep("50 millis")
  }
  return total
})

function scanSession(
  db: Database.Interface["db"],
  session: { id: string; project_id: string },
  resolver: Resolver,
  enabled: ReadonlySet<Kind>,
  limit: number,
) {
  return Effect.gen(function* () {
    let cursor = ""
    let total = 0
    while (total < limit) {
      const parts = yield* db
        .select()
        .from(PartTable)
        .where(
          and(
            eq(PartTable.session_id, session.id as never),
            gt(PartTable.id, cursor as never),
            sql`NOT EXISTS (SELECT 1 FROM history_fts WHERE history_fts.part_id = ${PartTable.id})`,
          ),
        )
        .orderBy(asc(PartTable.id))
        .limit(Math.min(BATCH, limit - total))
        .all()
        .pipe(Effect.orDie)
      if (parts.length === 0) return total

      total += yield* writeBatch(db, parts, session.project_id, resolver, enabled)
      cursor = parts[parts.length - 1]!.id
      yield* Effect.sleep("10 millis")
    }
    return total
  })
}

function writeBatch(
  db: Database.Interface["db"],
  parts: Array<{ id: string; session_id: string; message_id: string; data: unknown; time_created: number }>,
  projectID: string,
  resolver: Resolver,
  enabled: ReadonlySet<Kind>,
) {
  return Effect.gen(function* () {
    type ToWrite = {
      readonly part: (typeof parts)[number]
      readonly kind: Kind
      readonly body: string
      readonly tool_name: string | null
      readonly time: number
    }
    const writes: ToWrite[] = []
    for (const row of parts) {
      const role = yield* resolver.role(row.message_id)
      const part = {
        ...(row.data as object),
        id: row.id,
        sessionID: row.session_id,
        messageID: row.message_id,
      } as SessionV1.Part
      const extracted = extract(part, role, enabled)
      if (!extracted) continue
      writes.push({
        part: row,
        kind: extracted.kind,
        body: extracted.body,
        tool_name: extracted.tool_name,
        time: row.time_created,
      })
    }
    if (writes.length === 0) return 0

    yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          for (const write of writes) {
            yield* tx
              .insert(HistoryFtsTable)
              .values({
                part_id: write.part.id,
                session_id: write.part.session_id,
                message_id: write.part.message_id,
                project_id: projectID,
                kind: write.kind,
                tool_name: write.tool_name,
                body: write.body,
                time_created: write.time,
              })
              .onConflictDoUpdate({
                target: HistoryFtsTable.part_id,
                set: {
                  kind: write.kind,
                  tool_name: write.tool_name,
                  body: write.body,
                  time_created: write.time,
                },
              })
              .run()
          }
        }),
      )
      .pipe(Effect.orDie)
    return writes.length
  })
}

export const layer = Layer.effect(
  BackfillService,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const database = yield* Database.Service
    const state = yield* InstanceState.make(
      Effect.fn("History.Backfill.state")(function* () {
        const cfg = yield* config.get()
        yield* backfillWith(database.db, undefined, enabledKinds(cfg)).pipe(
          Effect.catchCause((cause) => Effect.logWarning("history backfill aborted", { cause })),
          Effect.forkDetach,
        )
        return { started: true }
      }),
    )

    return BackfillService.of({
      init: Effect.fn("History.Backfill.init")(function* () {
        yield* InstanceState.get(state)
      }),
      backfill: Effect.fn("History.Backfill.run")(function* (input?: BackfillInput) {
        const cfg = yield* config.get()
        return yield* backfillWith(database.db, input, enabledKinds(cfg))
      }),
    })
  }),
)
