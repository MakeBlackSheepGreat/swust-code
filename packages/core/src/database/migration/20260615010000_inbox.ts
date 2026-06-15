import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260615010000_inbox",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "inbox" (
          "id"                  TEXT PRIMARY KEY,
          "receiver_session_id" TEXT NOT NULL,
          "receiver_actor_id"   TEXT NOT NULL,
          "sender_session_id"   TEXT,
          "sender_actor_id"     TEXT,
          "type"                TEXT NOT NULL,
          "content"             TEXT NOT NULL,
          "created_at"          INTEGER NOT NULL,
          CONSTRAINT "fk_inbox_receiver_session_id_session_id_fk" FOREIGN KEY ("receiver_session_id") REFERENCES "session"("id") ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS "inbox_receiver_idx" ON "inbox" ("receiver_session_id", "receiver_actor_id", "id");`,
      )
      yield* tx.run(`CREATE INDEX IF NOT EXISTS "inbox_created_idx" ON "inbox" ("created_at");`)
    })
  },
} satisfies DatabaseMigration.Migration
