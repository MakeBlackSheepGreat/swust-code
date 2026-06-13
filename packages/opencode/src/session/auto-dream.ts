import { Effect } from "effect"
import { Database } from "@swust-code/core/database/database"
import { sql } from "drizzle-orm"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DREAM_INTERVAL_DAYS = 7
const DEFAULT_DISTILL_INTERVAL_DAYS = 30
const MIN_SPAWN_GAP_MS = 10_000

export const AUTO_DREAM_TITLE = "Auto Dream"
export const AUTO_DISTILL_TITLE = "Auto Distill"

let lastDreamSpawnTime = 0
let lastDistillSpawnTime = 0

export const DREAM_TASK = [
  "Run one automatic dream memory consolidation pass for the current project.",
  "",
  "Use the memory files as the working index and the raw trajectory database as the source of truth.",
  "Use bash for read-only SQLite and filesystem inspection. Do not modify the database.",
  "Consolidate only durable, verified information into project memory.",
].join("\n")

export const DISTILL_TASK = [
  "Run one automatic distill pass for the current project.",
  "",
  "Review the past month of sessions and identify repeated manual workflows worth packaging.",
  "Use the raw trajectory database as the source of truth and memory files to spot cross-session patterns.",
  "Inventory existing skills, agents, and commands first so you reuse or extend instead of duplicating.",
  "Use bash for read-only SQLite and filesystem inspection. Do not modify the database.",
  "Produce a compact shortlist, then create only the high-confidence missing assets.",
].join("\n")

function shouldAutoRun(input: {
  enabled: boolean
  intervalDays: number
  title: string
  label: string
}) {
  return Effect.gen(function* () {
    if (!input.enabled) return false

    const intervalMs = input.intervalDays * DAY_MS
    const db = (yield* Database.Service).db

    // Check last run with matching title
    const lastRunRows = yield* db.all<{ time_created: number }>(
      sql`SELECT time_created FROM session WHERE title = ${input.title} ORDER BY time_created DESC LIMIT 1`,
    ).pipe(Effect.catch(() => Effect.succeed([] as Array<{ time_created: number }>)))

    const lastRun = lastRunRows[0]
    const now = Date.now()
    const elapsed = lastRun ? now - lastRun.time_created : Infinity

    // If never run, check if project is old enough
    if (!lastRun) {
      const earliestRows = yield* db.all<{ time_created: number }>(
        sql`SELECT time_created FROM session WHERE parent_id IS NULL ORDER BY time_created ASC LIMIT 1`,
      ).pipe(Effect.catch(() => Effect.succeed([] as Array<{ time_created: number }>)))

      const earliest = earliestRows[0]
      if (!earliest || now - earliest.time_created < intervalMs) {
        return false
      }
    }

    if (elapsed < intervalMs) {
      return false
    }

    return true
  })
}

export function shouldAutoDream(): Effect.Effect<boolean> {
  const now = Date.now()
  if (now - lastDreamSpawnTime < MIN_SPAWN_GAP_MS) return Effect.succeed(false)
  lastDreamSpawnTime = now
  // Auto-dream requires Database.Service which is available in the app runtime.
  // For now, return false and let the Dream CLI command handle triggering.
  // Full integration will wire this through the session lifecycle.
  return Effect.succeed(false)
}

export function shouldAutoDistill(): Effect.Effect<boolean> {
  const now = Date.now()
  if (now - lastDistillSpawnTime < MIN_SPAWN_GAP_MS) return Effect.succeed(false)
  lastDistillSpawnTime = now
  return Effect.succeed(false)
}
