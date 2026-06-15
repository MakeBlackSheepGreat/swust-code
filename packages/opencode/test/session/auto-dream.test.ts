import { afterEach, describe, expect } from "bun:test"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { Project } from "@swust-code/core/project"
import { ProjectTable } from "@swust-code/core/project/sql"
import { AbsolutePath } from "@swust-code/core/schema"
import { MessageTable, PartTable, SessionTable } from "@swust-code/core/session/sql"
import { shouldAutoDistill, shouldAutoDream } from "@/session/auto-dream"
import { testEffect } from "../lib/effect"

const it = testEffect(Database.defaultLayer)
const projectID = Project.ID.make("proj_auto_dream_test")
const sessionID = "ses_auto_dream_test" as never
const originalEnv = process.env.SWUST_CODE_AUTO_EVOLUTION

afterEach(() => {
  if (originalEnv === undefined) delete process.env.SWUST_CODE_AUTO_EVOLUTION
  else process.env.SWUST_CODE_AUTO_EVOLUTION = originalEnv
})

const clear = Effect.fn("AutoDreamTest.clear")(function* () {
  const db = (yield* Database.Service).db
  yield* db.delete(PartTable).where(eq(PartTable.session_id, sessionID)).run().pipe(Effect.orDie)
  yield* db.delete(MessageTable).where(eq(MessageTable.session_id, sessionID)).run().pipe(Effect.orDie)
  yield* db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
  yield* db.delete(ProjectTable).where(eq(ProjectTable.id, projectID)).run().pipe(Effect.orDie)
})

const seedTopLevelSession = Effect.fn("AutoDreamTest.seed")(function* () {
  yield* clear()
  const db = (yield* Database.Service).db
  const now = Date.now()
  yield* db
    .insert(ProjectTable)
    .values({
      id: projectID,
      worktree: AbsolutePath.make("C:\\tmp\\swust-auto-dream"),
      sandboxes: [],
      time_created: now - 60_000,
      time_updated: now - 60_000,
    })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: projectID,
      slug: "auto-dream-test",
      directory: "C:\\tmp\\swust-auto-dream",
      title: "Regular Session",
      version: "1",
      time_created: now - 60_000,
      time_updated: now - 60_000,
    })
    .run()
    .pipe(Effect.orDie)
})

describe("auto dream/distill", () => {
  it.effect("honors MiMo-style auto=false configuration", () =>
    Effect.gen(function* () {
      process.env.SWUST_CODE_AUTO_EVOLUTION = "1"
      yield* seedTopLevelSession()

      expect(yield* shouldAutoDream({ dream: { auto: false, interval_days: 0 } })).toBe(false)
      expect(yield* shouldAutoDistill({ distill: { auto: false, interval_days: 0 } })).toBe(false)
    }),
  )

  it.effect("honors MiMo-style interval_days=0 configuration", () =>
    Effect.gen(function* () {
      process.env.SWUST_CODE_AUTO_EVOLUTION = "1"
      yield* seedTopLevelSession()

      expect(yield* shouldAutoDream({ dream: { interval_days: 0 } })).toBe(true)
      expect(yield* shouldAutoDistill({ distill: { interval_days: 0 } })).toBe(true)
    }),
  )
})
