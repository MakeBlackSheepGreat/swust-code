import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@swust-code/core/session/sql"
import type { SessionID } from "@/session/schema"

export const InboxTable = sqliteTable(
  "inbox",
  {
    id: text().primaryKey(),
    receiver_session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    receiver_actor_id: text().notNull(),
    sender_session_id: text().$type<SessionID>(),
    sender_actor_id: text(),
    type: text().notNull(),
    content: text({ mode: "json" }).notNull().$type<{ text?: string }>(),
    created_at: integer().notNull(),
  },
  (table) => [
    index("inbox_receiver_idx").on(table.receiver_session_id, table.receiver_actor_id, table.id),
    index("inbox_created_idx").on(table.created_at),
  ],
)

export type InboxRow = typeof InboxTable.$inferSelect
