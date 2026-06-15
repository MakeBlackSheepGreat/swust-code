import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260615000000_message_agent_id",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE "message" ADD COLUMN "agent_id" TEXT NOT NULL DEFAULT 'main';`)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS "message_session_agent_idx" ON "message" ("session_id", "agent_id", "id");`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
