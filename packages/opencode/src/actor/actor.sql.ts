import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@swust-code/core/session/sql"

export const ActorRegistryTable = sqliteTable(
  "actor_registry",
  {
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    actor_id: text().notNull(),
    mode: text().$type<"peer" | "subagent">().notNull(),
    parent_actor_id: text(),
    status: text().$type<"pending" | "running" | "idle" | "cancelled" | "failed">().notNull(),
    last_outcome: text().$type<"success" | "failure" | "cancelled">(),
    lifecycle: text().$type<"ephemeral" | "persistent">().notNull(),
    agent: text().notNull(),
    description: text(),
    background: integer({ mode: "boolean" }).notNull(),
    last_turn_time: integer().notNull(),
    turn_count: integer().notNull().default(0),
    last_error: text(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
    time_completed: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.actor_id] }),
    index("actor_registry_session_agent_idx").on(table.session_id, table.agent),
    index("actor_registry_session_parent_idx").on(table.session_id, table.parent_actor_id),
    index("actor_registry_status_idx").on(table.status),
    index("actor_registry_status_last_turn_idx").on(table.status, table.last_turn_time),
  ],
)

export type ActorRegistryRow = typeof ActorRegistryTable.$inferSelect
