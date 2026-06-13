import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Database } from "../database/database"
import { Service as ReconcilerService, defaultLayer as ReconcilerDefaultLayer } from "./reconcile"
import { Flag } from "../flag/flag"
import { buildFtsQuery, applyScoreFloor, type SearchResult } from "./fts-query"
import { assertMemoryWriteAllowed } from "./write-guard"
import { sql } from "drizzle-orm"

export type { SearchResult }

export interface WriteInput {
  readonly scope: "global" | "projects" | "sessions"
  readonly scopeId: string
  readonly key: string
  readonly content: string
  readonly mode?: "overwrite" | "append"
  readonly agentType?: "main" | "subagent"
  readonly taskId?: string
}

export interface Interface {
  readonly search: (
    query: string,
    opts?: { readonly limit?: number; readonly kind?: string },
  ) => Effect.Effect<ReadonlyArray<SearchResult>>
  readonly write: (input: WriteInput) => Effect.Effect<string>
  readonly reconcile: () => Effect.Effect<void>
  readonly root: () => string
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Memory") {}

const DEFAULT_LIMIT = 10
const OVERFETCH_MULTIPLIER = 3

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const reconciler = yield* ReconcilerService
    const global = yield* Global.Service
    const db = (yield* Database.Service).db

    const root = global.data + "/memory"

    const reconcile = (): Effect.Effect<void> =>
      Effect.sync(() => {
        Effect.runFork(reconciler.reconcile())
      })

    const search = (
      query: string,
      opts?: { readonly limit?: number; readonly kind?: string },
    ): Effect.Effect<ReadonlyArray<SearchResult>> =>
      Effect.sync(() => {
        if (Flag.SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH) {
          Effect.runFork(reconciler.reconcile())
        }

        const ftsQuery = buildFtsQuery(query)
        if (!ftsQuery) return [] as ReadonlyArray<SearchResult>

        const limit = opts?.limit ?? DEFAULT_LIMIT
        const fetchLimit = Math.min(limit * OVERFETCH_MULTIPLIER, 50)

        let querySql = sql`SELECT d.path, d.kind, d.scope_id, d.title, snippet(memory_fts, 2, '⟨', '⟩', '...', 32) AS snippet, -bm25(memory_fts) AS score FROM memory_fts JOIN memory_doc d ON d.rowid = memory_fts.rowid WHERE memory_fts MATCH ${ftsQuery}`

        if (opts?.kind) {
          querySql = sql`${querySql} AND d.kind = ${opts.kind}`
        }

        querySql = sql`${querySql} ORDER BY bm25(memory_fts) LIMIT ${fetchLimit}`

        const rowsEffect = db.all<{
          path: string
          kind: string
          scope_id: string
          title: string
          snippet: string
          score: number
        }>(querySql)

        const rows = Effect.runSync(rowsEffect.pipe(Effect.catch(() => Effect.succeed([] as Array<{
          path: string; kind: string; scope_id: string; title: string; snippet: string; score: number
        }>))))

        const results: SearchResult[] = rows.map((r) => ({
          path: r.path,
          kind: r.kind as SearchResult["kind"],
          scopeId: r.scope_id,
          title: r.title,
          snippet: r.snippet,
          score: r.score,
        }))

        return applyScoreFloor(results, Flag.SWUST_CODE_MEMORY_SEARCH_SCORE_FLOOR, limit)
      })

    const write = (input: WriteInput): Effect.Effect<string> =>
      Effect.sync(() => {
        const filePath = path.join(root, input.scope, input.scopeId, input.key)

        assertMemoryWriteAllowed({
          target: filePath,
          memoryRoot: root,
          agentType: input.agentType,
          taskId: input.taskId,
        })

        const dir = path.dirname(filePath)
        fs.mkdirSync(dir, { recursive: true })

        if (input.mode === "append" && fs.existsSync(filePath)) {
          const existing = fs.readFileSync(filePath, "utf-8")
          fs.writeFileSync(filePath, existing + "\n" + input.content, "utf-8")
        } else {
          fs.writeFileSync(filePath, input.content, "utf-8")
        }

        return filePath
      })

    return Service.of({ search, write, reconcile, root: () => root })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(ReconcilerDefaultLayer),
  Layer.provide(Database.defaultLayer),
  Layer.provide(Global.defaultLayer),
)
