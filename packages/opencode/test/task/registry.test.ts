import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { EventV2 } from "@swust-code/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TaskRegistry } from "@/task/registry"
import { parseTaskScript } from "@/tool/task"
import { SessionID } from "@/session/schema"
import { testEffect } from "../lib/effect"

const database = Database.layerFromPath(":memory:")
const eventLayer = EventV2.layer.pipe(Layer.provide(database))
const bridgeLayer = EventV2Bridge.layer.pipe(Layer.provide(eventLayer))
const taskLayer = TaskRegistry.layer.pipe(Layer.provide(bridgeLayer), Layer.provide(database))
const layer = Layer.merge(database, taskLayer)
const it = testEffect(layer)

const sessionID = SessionID.make("ses_task_tree")

const seedSession = Effect.fn("TaskRegistryTest.seedSession")(function* () {
  const { db } = yield* Database.Service
  const now = Date.now()
  yield* db
    .run(sql`
      INSERT INTO project (
        id, worktree, vcs, name, time_created, time_updated, sandboxes
      ) VALUES (
        'proj_task_tree', '/tmp/swust-code-task-tree', NULL, 'task tree', ${now}, ${now}, '[]'
      )
    `)
    .pipe(Effect.orDie)
  yield* db
    .run(sql`
      INSERT INTO session (
        id, project_id, slug, directory, title, version, time_created, time_updated
      ) VALUES (
        ${sessionID}, 'proj_task_tree', 'task-tree', '/tmp/swust-code-task-tree', 'Task tree', 'test', ${now}, ${now}
      )
    `)
    .pipe(Effect.orDie)
})

describe("task.registry", () => {
  it.effect("creates a MiMo-style task tree and transitions lifecycle states", () =>
    Effect.gen(function* () {
      yield* seedSession()
      const registry = yield* TaskRegistry.Service

      const parent = yield* registry.create({ session_id: sessionID, summary: "Implement parser", owner: "build" })
      const sibling = yield* registry.create({ session_id: sessionID, summary: "Write docs", owner: "build" })
      const child = yield* registry.create({
        session_id: sessionID,
        parent_id: parent.id,
        summary: "Lexer",
        owner: "explore-1",
      })

      expect(String(parent.id)).toBe("T1")
      expect(String(sibling.id)).toBe("T2")
      expect(String(child.id)).toBe("T1.1")

      const started = yield* registry.start({
        session_id: sessionID,
        id: parent.id,
        owner: "build",
        event_summary: "starting parser",
      })
      expect(started.status).toBe("in_progress")

      const blocked = yield* registry.block({ session_id: sessionID, id: parent.id, event_summary: "waiting on grammar" })
      expect(blocked.status).toBe("blocked")

      const unblocked = yield* registry.unblock({ session_id: sessionID, id: parent.id, event_summary: "grammar ready" })
      expect(unblocked.status).toBe("open")

      const renamed = yield* registry.rename({ session_id: sessionID, id: parent.id, summary: "Implement recursive parser" })
      expect(renamed.summary).toBe("Implement recursive parser")

      const done = yield* registry.done({ session_id: sessionID, id: parent.id, event_summary: "tests pass" })
      expect(done.status).toBe("done")
      expect(done.ended_at).toBeDefined()
      expect(done.cleanup_after).toBeDefined()

      const notResurrected = yield* registry.start({ session_id: sessionID, id: parent.id, owner: "build" })
      expect(notResurrected.status).toBe("done")

      const active = yield* registry.list({ session_id: sessionID })
      expect(active.map((task) => String(task.id))).toEqual(["T2", "T1.1"])

      const events = yield* registry.events({ session_id: sessionID, task_id: parent.id })
      expect(events.map((event) => event.kind)).toEqual([
        "created",
        "started",
        "blocked",
        "unblocked",
        "renamed",
        "done",
      ])
    }),
  )

  it.effect("parses MiMo task shell scripts", () =>
    Effect.gen(function* () {
      const parsed = yield* parseTaskScript(
        [
          'task create "Implement auth"',
          'task create "Lexer" --parent T1',
          'task start T1 --reason "now"',
          'task done T1 "all tests pass"',
        ].join("\n"),
      )

      expect(parsed).toEqual([
        { operation: { action: "create", summary: "Implement auth" } },
        { operation: { action: "create", summary: "Lexer", parent_id: "T1" } },
        { operation: { action: "start", id: "T1", event_summary: "now" } },
        { operation: { action: "done", id: "T1", event_summary: "all tests pass" } },
      ])
    }),
  )
})
