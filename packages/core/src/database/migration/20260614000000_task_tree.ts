import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260614000000_task_tree",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "task" (
          "id"             TEXT NOT NULL,
          "session_id"     TEXT NOT NULL,
          "parent_task_id" TEXT,
          "status"         TEXT NOT NULL,
          "summary"        TEXT NOT NULL,
          "owner"          TEXT,
          "created_at"     INTEGER NOT NULL,
          "last_event_at"  INTEGER NOT NULL,
          "ended_at"       INTEGER,
          "cleanup_after"  INTEGER,
          CONSTRAINT "task_pk" PRIMARY KEY("session_id", "id"),
          CONSTRAINT "fk_task_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE
        );
      `)

      yield* tx.run(`CREATE INDEX IF NOT EXISTS "task_session_idx" ON "task" ("session_id");`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS "task_parent_idx" ON "task" ("session_id", "parent_task_id");`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS "task_status_idx" ON "task" ("status");`)

      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "task_event" (
          "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
          "session_id" TEXT NOT NULL,
          "task_id"    TEXT NOT NULL,
          "at"         INTEGER NOT NULL,
          "kind"       TEXT NOT NULL,
          "summary"    TEXT,
          CONSTRAINT "fk_task_event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE,
          CONSTRAINT "fk_task_event_task_fk" FOREIGN KEY ("session_id", "task_id") REFERENCES "task"("session_id", "id") ON DELETE CASCADE
        );
      `)

      yield* tx.run(`CREATE INDEX IF NOT EXISTS "task_event_task_idx" ON "task_event" ("session_id", "task_id", "at");`)
    })
  },
} satisfies DatabaseMigration.Migration
