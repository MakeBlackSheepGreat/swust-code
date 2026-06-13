import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260612000000_memory_fts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS "memory_doc" (
          "path"       TEXT PRIMARY KEY,
          "kind"       TEXT NOT NULL,
          "scope_id"   TEXT NOT NULL DEFAULT '',
          "title"      TEXT NOT NULL DEFAULT '',
          "content"    TEXT NOT NULL,
          "size"       INTEGER NOT NULL,
          "mtime_ms"   INTEGER NOT NULL,
          "time_indexed" INTEGER NOT NULL
        );
      `)

      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS "memory_doc_kind_scope_idx"
        ON "memory_doc" ("kind", "scope_id");
      `)

      yield* tx.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS "memory_fts" USING fts5(
          "path", "title", "content",
          content="memory_doc",
          content_rowid="rowid"
        );
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "memory_doc_ai" AFTER INSERT ON "memory_doc" BEGIN
          INSERT INTO memory_fts(rowid, path, title, content)
            VALUES (new.rowid, new.path, new.title, new.content);
        END;
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "memory_doc_ad" AFTER DELETE ON "memory_doc" BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, path, title, content)
            VALUES ('delete', old.rowid, old.path, old.title, old.content);
        END;
      `)

      yield* tx.run(`
        CREATE TRIGGER IF NOT EXISTS "memory_doc_au" AFTER UPDATE ON "memory_doc" BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, path, title, content)
            VALUES ('delete', old.rowid, old.path, old.title, old.content);
          INSERT INTO memory_fts(rowid, path, title, content)
            VALUES (new.rowid, new.path, new.title, new.content);
        END;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
