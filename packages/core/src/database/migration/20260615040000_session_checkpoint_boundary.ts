import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260615040000_session_checkpoint_boundary",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE "session" ADD COLUMN "last_checkpoint_message_id" TEXT;`)
    })
  },
} satisfies DatabaseMigration.Migration
