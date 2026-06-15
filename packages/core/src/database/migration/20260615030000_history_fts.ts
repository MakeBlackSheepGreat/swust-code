import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260615030000_history_fts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "history_fts" (
          "part_id"      TEXT PRIMARY KEY,
          "session_id"   TEXT NOT NULL,
          "message_id"   TEXT NOT NULL,
          "project_id"   TEXT NOT NULL,
          "kind"         TEXT NOT NULL,
          "tool_name"    TEXT,
          "body"         TEXT NOT NULL,
          "time_created" INTEGER NOT NULL
        );
      `)

      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS "history_fts_session_idx"
        ON "history_fts" ("session_id", "time_created");
      `)

      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS "history_fts_project_idx"
        ON "history_fts" ("project_id", "time_created");
      `)

      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS "history_fts_message_idx"
        ON "history_fts" ("message_id");
      `)

      yield* tx.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS "history_fts_idx" USING fts5(
          "body",
          content="history_fts",
          content_rowid="rowid"
        );
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "history_fts_ai" AFTER INSERT ON "history_fts" BEGIN
          INSERT INTO history_fts_idx(rowid, body)
            VALUES (new.rowid, new.body);
        END;
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "history_fts_ad" AFTER DELETE ON "history_fts" BEGIN
          INSERT INTO history_fts_idx(history_fts_idx, rowid, body)
            VALUES ('delete', old.rowid, old.body);
        END;
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "history_fts_au" AFTER UPDATE ON "history_fts" BEGIN
          INSERT INTO history_fts_idx(history_fts_idx, rowid, body)
            VALUES ('delete', old.rowid, old.body);
          INSERT INTO history_fts_idx(rowid, body)
            VALUES (new.rowid, new.body);
        END;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
