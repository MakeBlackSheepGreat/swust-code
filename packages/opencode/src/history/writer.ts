import { Context, Effect, Layer, Queue } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { EventV2 } from "@swust-code/core/event"
import type { ConfigV1 } from "@swust-code/core/v1/config/config"
import { SessionV1 } from "@swust-code/core/v1/session"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { DEFAULT_KINDS, extract, type Kind } from "./extract"
import { HistoryFtsTable } from "./fts.sql"
import { makeResolver, type Resolver } from "./resolve"

type Job =
  | { readonly type: "upsert"; readonly part: SessionV1.Part; readonly time: number }
  | { readonly type: "delete"; readonly partID: string }

export interface Interface {
  readonly init: () => Effect.Effect<void>
}

export class WriterService extends Context.Service<WriterService, Interface>()("@swust-code/History.Writer") {}

function enabledKinds(config: ConfigV1.Info): ReadonlySet<Kind> {
  return new Set((config.history?.kinds ?? DEFAULT_KINDS) as readonly Kind[])
}

export const layer = Layer.effect(
  WriterService,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const db = (yield* Database.Service).db

    const state = yield* InstanceState.make(
      Effect.fn("History.Writer.state")(function* () {
        const cfg = yield* config.get()
        const enabled = enabledKinds(cfg)
        if (enabled.size === 0) return { started: true }

        const queue = yield* Queue.unbounded<Job>()
        const resolver = makeResolver(db)

        const unsubscribe = yield* events.listen((event) => {
          if (event.type === SessionV1.Event.PartUpdated.type) {
            const data = event.data as EventV2.Data<typeof SessionV1.Event.PartUpdated>
            return Queue.offer(queue, {
              type: "upsert",
              part: data.part as unknown as SessionV1.Part,
              time: data.time,
            }).pipe(Effect.ignore)
          }
          if (event.type === SessionV1.Event.PartRemoved.type) {
            const data = event.data as EventV2.Data<typeof SessionV1.Event.PartRemoved>
            return Queue.offer(queue, { type: "delete", partID: data.partID }).pipe(Effect.ignore)
          }
          return Effect.void
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        yield* Effect.forever(
          Effect.gen(function* () {
            const job = yield* Queue.take(queue)
            yield* handle(db, job, resolver, enabled).pipe(
              Effect.catchCause((cause) => Effect.logWarning("history write failed", { cause })),
            )
          }),
        ).pipe(Effect.forkScoped)
        return { started: true }
      }),
    )

    return WriterService.of({
      init: Effect.fn("History.Writer.init")(function* () {
        yield* InstanceState.get(state)
      }),
    })
  }),
)

function handle(
  db: Database.Interface["db"],
  job: Job,
  resolver: Resolver,
  enabled: ReadonlySet<Kind>,
) {
  if (job.type === "delete") {
    return db.delete(HistoryFtsTable).where(eq(HistoryFtsTable.part_id, job.partID)).run().pipe(Effect.orDie)
  }

  return Effect.gen(function* () {
    const role = yield* resolver.role(job.part.messageID)
    const extracted = extract(job.part, role, enabled)
    if (!extracted) return
    const projectID = yield* resolver.projectID(job.part.sessionID)

    yield* db
      .insert(HistoryFtsTable)
      .values({
        part_id: job.part.id,
        session_id: job.part.sessionID,
        message_id: job.part.messageID,
        project_id: projectID,
        kind: extracted.kind,
        tool_name: extracted.tool_name,
        body: extracted.body,
        time_created: job.time,
      })
      .onConflictDoUpdate({
        target: HistoryFtsTable.part_id,
        set: {
          session_id: job.part.sessionID,
          message_id: job.part.messageID,
          project_id: projectID,
          kind: extracted.kind,
          tool_name: extracted.tool_name,
          body: extracted.body,
          time_created: job.time,
        },
      })
      .run()
      .pipe(Effect.orDie)
  })
}
