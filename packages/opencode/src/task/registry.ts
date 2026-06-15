import { Context, Effect, Layer } from "effect"
import { and, asc, eq, gt, isNull, or, type SQL } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { LayerNode } from "@swust-code/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import type { SessionID } from "@/session/schema"
import { TaskEventTable, TaskTable } from "./task.sql"
import type { Task, TaskEvent } from "./schema"
import { Created as TaskCreated, Updated as TaskUpdated, type UpdatedKind } from "./events"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_ARCHIVE_DAYS = 7

type TaskRow = typeof TaskTable.$inferSelect
type TaskEventRow = typeof TaskEventTable.$inferSelect

function fromTaskRow(row: TaskRow): Task {
  return {
    id: row.id as Task["id"],
    session_id: row.session_id as SessionID,
    parent_task_id: (row.parent_task_id as Task["parent_task_id"]) ?? undefined,
    status: row.status,
    summary: row.summary,
    owner: row.owner ?? undefined,
    created_at: row.created_at,
    last_event_at: row.last_event_at,
    ended_at: row.ended_at ?? undefined,
    cleanup_after: row.cleanup_after ?? undefined,
  }
}

function fromEventRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    task_id: row.task_id as TaskEvent["task_id"],
    at: row.at,
    kind: row.kind as TaskEvent["kind"],
    summary: row.summary ?? undefined,
  }
}

function nextChildId(parentId: string | undefined, siblings: string[]): string {
  const prefix = parentId ? `${parentId}.` : "T"
  const used = siblings
    .filter((sibling) => (parentId ? sibling.startsWith(prefix) : /^T\d+$/.test(sibling)))
    .map((sibling) => {
      const tail = sibling.slice(prefix.length)
      return /^\d+$/.test(tail) ? Number(tail) : 0
    })
  const next = used.length > 0 ? Math.max(...used) + 1 : 1
  return `${prefix}${next}`
}

export interface Interface {
  readonly create: (input: {
    session_id: SessionID
    summary: string
    parent_id?: string
    owner?: string
  }) => Effect.Effect<Task>

  readonly list: (input: {
    session_id?: SessionID
    status?: Task["status"]
    owner?: string
    include_terminal?: boolean
    include_archived?: boolean
  }) => Effect.Effect<Task[]>

  readonly get: (input: { session_id: SessionID; id: string }) => Effect.Effect<Task | undefined>
  readonly block: (input: { session_id: SessionID; id: string; event_summary?: string }) => Effect.Effect<Task>
  readonly unblock: (input: { session_id: SessionID; id: string; event_summary?: string }) => Effect.Effect<Task>
  readonly done: (input: { session_id: SessionID; id: string; event_summary?: string }) => Effect.Effect<Task>
  readonly abandon: (input: { session_id: SessionID; id: string; event_summary?: string }) => Effect.Effect<Task>
  readonly rename: (input: { session_id: SessionID; id: string; summary: string }) => Effect.Effect<Task>
  readonly start: (input: { session_id: SessionID; id: string; owner?: string; event_summary?: string }) => Effect.Effect<Task>
  readonly events: (input: { session_id: SessionID; task_id: string }) => Effect.Effect<TaskEvent[]>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/TaskRegistry") {}

export const layer: Layer.Layer<Service, never, Database.Service | EventV2Bridge.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2Bridge.Service

    const cleanupAfter = (now: number) => Effect.succeed(now + DEFAULT_ARCHIVE_DAYS * DAY_MS)

    const insertEvent = (
      session_id: SessionID,
      task_id: string,
      kind: TaskEvent["kind"],
      summary: string | undefined,
      now: number,
    ) =>
      db
        .insert(TaskEventTable)
        .values({ session_id, task_id, at: now, kind, summary: summary ?? null })
        .run()
        .pipe(Effect.orDie)

    const publishCreated = (task: Task) =>
      Effect.runFork(events.publish(TaskCreated, { sessionID: task.session_id, task }))

    const publishUpdated = (task: Task, kind: UpdatedKind) =>
      Effect.runFork(events.publish(TaskUpdated, { sessionID: task.session_id, task, kind }))

    const create = Effect.fn("TaskRegistry.create")(function* (input: {
      session_id: SessionID
      summary: string
      parent_id?: string
      owner?: string
    }) {
      const now = Date.now()
      const siblings = yield* db
        .select({ id: TaskTable.id })
        .from(TaskTable)
        .where(
          and(
            eq(TaskTable.session_id, input.session_id),
            input.parent_id ? eq(TaskTable.parent_task_id, input.parent_id) : isNull(TaskTable.parent_task_id),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      const id = nextChildId(
        input.parent_id,
        siblings.map((sibling) => sibling.id),
      )
      const row: TaskRow = {
        id,
        session_id: input.session_id,
        parent_task_id: input.parent_id ?? null,
        status: "open",
        summary: input.summary,
        owner: input.owner ?? null,
        created_at: now,
        last_event_at: now,
        ended_at: null,
        cleanup_after: null,
      }
      yield* db.insert(TaskTable).values(row).run().pipe(Effect.orDie)
      yield* insertEvent(input.session_id, id, "created", undefined, now)
      const task = fromTaskRow(row)
      publishCreated(task)
      return task
    })

    const list = Effect.fn("TaskRegistry.list")(function* (input: {
      session_id?: SessionID
      status?: Task["status"]
      owner?: string
      include_terminal?: boolean
      include_archived?: boolean
    }) {
      const now = Date.now()
      const conds: SQL[] = []
      if (input.session_id) conds.push(eq(TaskTable.session_id, input.session_id))
      if (input.status) conds.push(eq(TaskTable.status, input.status))
      if (input.owner) conds.push(eq(TaskTable.owner, input.owner))
      if (!input.include_terminal) {
        const nonTerminal = or(
          eq(TaskTable.status, "open"),
          eq(TaskTable.status, "in_progress"),
          eq(TaskTable.status, "blocked"),
        )
        if (nonTerminal) conds.push(nonTerminal)
      }
      if (!input.include_archived) {
        const notArchived = or(isNull(TaskTable.cleanup_after), gt(TaskTable.cleanup_after, now))
        if (notArchived) conds.push(notArchived)
      }
      const where = conds.length > 0 ? and(...conds) : undefined
      const rows = yield* db.select().from(TaskTable).where(where).orderBy(asc(TaskTable.created_at)).all().pipe(Effect.orDie)
      return rows.map(fromTaskRow)
    })

    const get = Effect.fn("TaskRegistry.get")(function* (input: { session_id: SessionID; id: string }) {
      const row = yield* db
        .select()
        .from(TaskTable)
        .where(and(eq(TaskTable.session_id, input.session_id), eq(TaskTable.id, input.id)))
        .get()
        .pipe(Effect.orDie)
      return row ? fromTaskRow(row) : undefined
    })

    const eventsForTask = Effect.fn("TaskRegistry.events")(function* (input: { session_id: SessionID; task_id: string }) {
      const rows = yield* db
        .select()
        .from(TaskEventTable)
        .where(and(eq(TaskEventTable.session_id, input.session_id), eq(TaskEventTable.task_id, input.task_id)))
        .orderBy(asc(TaskEventTable.at))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromEventRow)
    })

    const updateStatus = Effect.fn("TaskRegistry.updateStatus")(function* (input: {
      session_id: SessionID
      id: string
      status: Task["status"]
      kind: Exclude<TaskEvent["kind"], "created" | "renamed">
      event_summary?: string
      owner?: string
      terminal?: boolean
    }) {
      const now = Date.now()
      const cleanup = input.terminal ? yield* cleanupAfter(now) : undefined
      yield* db
        .update(TaskTable)
        .set({
          status: input.status,
          ...(input.owner !== undefined ? { owner: input.owner } : {}),
          ...(input.terminal ? { ended_at: now, cleanup_after: cleanup } : {}),
          last_event_at: now,
        })
        .where(and(eq(TaskTable.session_id, input.session_id), eq(TaskTable.id, input.id)))
        .run()
        .pipe(Effect.orDie)
      yield* insertEvent(input.session_id, input.id, input.kind, input.event_summary, now)
      const updated = yield* get({ session_id: input.session_id, id: input.id })
      if (!updated) return yield* Effect.die(`Task ${input.id} not found in session ${input.session_id}`)
      publishUpdated(updated, input.kind)
      return updated
    })

    const block = (input: { session_id: SessionID; id: string; event_summary?: string }) =>
      updateStatus({ ...input, status: "blocked", kind: "blocked" })

    const unblock = (input: { session_id: SessionID; id: string; event_summary?: string }) =>
      updateStatus({ ...input, status: "open", kind: "unblocked" })

    const start = Effect.fn("TaskRegistry.start")(function* (input: {
      session_id: SessionID
      id: string
      owner?: string
      event_summary?: string
    }) {
      const existing = yield* get({ session_id: input.session_id, id: input.id })
      if (!existing) return yield* Effect.die(`Task ${input.id} not found in session ${input.session_id}`)
      if (existing.status === "done" || existing.status === "abandoned") {
        yield* Effect.logWarning(`refusing to start terminal task ${input.id} (status=${existing.status})`)
        return existing
      }
      const owner = input.owner ?? existing.owner
      if (existing.status === "in_progress" && owner === existing.owner) return existing
      return yield* updateStatus({
        session_id: input.session_id,
        id: input.id,
        status: "in_progress",
        kind: "started",
        owner,
        event_summary: input.event_summary,
      })
    })

    const done = (input: { session_id: SessionID; id: string; event_summary?: string }) =>
      updateStatus({ ...input, status: "done", kind: "done", terminal: true })

    const abandon = (input: { session_id: SessionID; id: string; event_summary?: string }) =>
      updateStatus({ ...input, status: "abandoned", kind: "abandoned", terminal: true })

    const rename = Effect.fn("TaskRegistry.rename")(function* (input: { session_id: SessionID; id: string; summary: string }) {
      const now = Date.now()
      yield* db
        .update(TaskTable)
        .set({ summary: input.summary, last_event_at: now })
        .where(and(eq(TaskTable.session_id, input.session_id), eq(TaskTable.id, input.id)))
        .run()
        .pipe(Effect.orDie)
      yield* insertEvent(input.session_id, input.id, "renamed", input.summary, now)
      const updated = yield* get({ session_id: input.session_id, id: input.id })
      if (!updated) return yield* Effect.die(`Task ${input.id} not found in session ${input.session_id}`)
      publishUpdated(updated, "renamed")
      return updated
    })

    return Service.of({
      create,
      list,
      get,
      events: eventsForTask,
      block,
      unblock,
      done,
      abandon,
      rename,
      start,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer), Layer.provide(EventV2Bridge.defaultLayer))

export const node = LayerNode.make(layer, [Database.node, EventV2Bridge.node])

export * as TaskRegistry from "./registry"
