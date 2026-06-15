import { Effect } from "effect"
import { Database } from "@swust-code/core/database/database"
import { sql } from "drizzle-orm"
import { basename } from "path"
import { Process } from "@/util/process"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DREAM_INTERVAL_DAYS = 7
const DEFAULT_DISTILL_INTERVAL_DAYS = 30
const MIN_SPAWN_GAP_MS = 10_000
const AUTO_EVOLUTION_ENV = "SWUST_CODE_AUTO_EVOLUTION"

export const AUTO_DREAM_TITLE = "Auto Dream"
export const AUTO_DISTILL_TITLE = "Auto Distill"

export type AutoEvolutionConfig = {
  readonly dream?: {
    readonly auto?: boolean
    readonly interval_days?: number
  }
  readonly distill?: {
    readonly auto?: boolean
    readonly interval_days?: number
  }
}

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
    if (!autoEvolutionEnabled()) return false
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

function autoEvolutionEnabled() {
  const value = process.env[AUTO_EVOLUTION_ENV]
  return value !== "0" && value?.toLowerCase() !== "false"
}

function currentCli(args: string[]) {
  const name = basename(process.execPath).replace(/\.exe$/i, "").toLowerCase()
  if (name === "bun" && process.argv[1]) return [process.execPath, ...process.execArgv, process.argv[1], ...args]
  return [process.execPath, ...args]
}

export function buildAutoEvolutionCommand(input: {
  readonly kind: "dream" | "distill"
  readonly cwd: string
}) {
  return currentCli([input.kind, "--yes", "--dir", input.cwd])
}

function enqueueAutoEvolution(input: {
  readonly kind: "dream" | "distill"
  readonly cwd: string
}) {
  return Effect.sync(() => {
    if (!autoEvolutionEnabled()) return undefined
    const proc = Process.spawn(buildAutoEvolutionCommand(input), {
      cwd: input.cwd,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        [AUTO_EVOLUTION_ENV]: "0",
      },
    })
    void proc.exited.catch(() => undefined)
    return proc.pid
  })
}

export function shouldAutoDream(cfg: AutoEvolutionConfig = {}): Effect.Effect<boolean, never, Database.Service> {
  const enabled = cfg.dream?.auto !== false
  if (!enabled) return Effect.succeed(false)
  const now = Date.now()
  if (now - lastDreamSpawnTime < MIN_SPAWN_GAP_MS) return Effect.succeed(false)
  lastDreamSpawnTime = now
  const intervalDays = cfg.dream?.interval_days ?? DEFAULT_DREAM_INTERVAL_DAYS
  return shouldAutoRun({
    enabled,
    intervalDays,
    title: AUTO_DREAM_TITLE,
    label: "dream",
  })
}

export function shouldAutoDistill(cfg: AutoEvolutionConfig = {}): Effect.Effect<boolean, never, Database.Service> {
  const enabled = cfg.distill?.auto !== false
  if (!enabled) return Effect.succeed(false)
  const now = Date.now()
  if (now - lastDistillSpawnTime < MIN_SPAWN_GAP_MS) return Effect.succeed(false)
  lastDistillSpawnTime = now
  const intervalDays = cfg.distill?.interval_days ?? DEFAULT_DISTILL_INTERVAL_DAYS
  return shouldAutoRun({
    enabled,
    intervalDays,
    title: AUTO_DISTILL_TITLE,
    label: "distill",
  })
}

export function enqueueAutoDream(input: { readonly cwd: string }): Effect.Effect<number | undefined> {
  return enqueueAutoEvolution({ kind: "dream", cwd: input.cwd })
}

export function enqueueAutoDistill(input: { readonly cwd: string }): Effect.Effect<number | undefined> {
  return enqueueAutoEvolution({ kind: "distill", cwd: input.cwd })
}
