import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260615020000_actor_registry",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "actor_registry" (
          "session_id"      TEXT NOT NULL,
          "actor_id"        TEXT NOT NULL,
          "mode"            TEXT NOT NULL,
          "parent_actor_id" TEXT,
          "status"          TEXT NOT NULL,
          "last_outcome"    TEXT,
          "lifecycle"       TEXT NOT NULL,
          "agent"           TEXT NOT NULL,
          "description"     TEXT,
          "background"      INTEGER NOT NULL,
          "last_turn_time"  INTEGER NOT NULL,
          "turn_count"      INTEGER NOT NULL DEFAULT 0,
          "last_error"      TEXT,
          "time_created"    INTEGER NOT NULL,
          "time_updated"    INTEGER NOT NULL,
          "time_completed"  INTEGER,
          CONSTRAINT "actor_registry_pk" PRIMARY KEY("session_id", "actor_id"),
          CONSTRAINT "fk_actor_registry_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS "actor_registry_session_agent_idx" ON "actor_registry" ("session_id", "agent");`,
      )
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS "actor_registry_session_parent_idx" ON "actor_registry" ("session_id", "parent_actor_id");`,
      )
      yield* tx.run(`CREATE INDEX IF NOT EXISTS "actor_registry_status_idx" ON "actor_registry" ("status");`)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS "actor_registry_status_last_turn_idx" ON "actor_registry" ("status", "last_turn_time");`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
