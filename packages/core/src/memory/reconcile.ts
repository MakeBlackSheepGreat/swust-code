import path from "path"
import fs from "fs/promises"
import { sql } from "drizzle-orm"
import { Context, Effect, Layer, Semaphore } from "effect"
import { Global } from "../global"
import { Database } from "../database/database"
import { memoryRoot, memoryDirs, ensureDirs, parseMemoryPath } from "./paths"

export interface ReconcileStats {
  readonly added: number
  readonly updated: number
  readonly removed: number
}

export interface Interface {
  readonly reconcile: () => Effect.Effect<ReconcileStats>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/MemoryReconciler") {}

const MAX_FILE_SIZE = 1024 * 1024
const MAX_FILE_COUNT = 10_000

function extractTitle(content: string, filePath: string): string {
  const firstLine = content.split("\n").find((l) => l.trim().length > 0) ?? ""
  if (firstLine.startsWith("# ")) return firstLine.slice(2).trim()
  if (firstLine.startsWith("## ")) return firstLine.slice(3).trim()
  return path.basename(filePath, path.extname(filePath))
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const db = (yield* Database.Service).db
    const lock = yield* Semaphore.make(1)

    const root = memoryRoot(global.data)
    yield* ensureDirs(root)

    const reconcile = (): Effect.Effect<ReconcileStats> =>
      lock.withPermit(
        Effect.gen(function* () {
          const dirs = memoryDirs(root)
          const diskPathSet = new Set<string>()
          const diskFiles: Array<{ absPath: string; size: number; mtimeMs: number }> = []

          // Walk disk
          for (const dir of dirs) {
            const entries = yield* Effect.tryPromise({
              try: () => fs.readdir(dir, { withFileTypes: true, recursive: true }),
              catch: () => [] as import("fs").Dirent[],
            }).pipe(Effect.catch(() => Effect.succeed([] as import("fs").Dirent[])))

            for (const entry of entries) {
              if (!entry.isFile()) continue
              if (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt")) continue
              const parentPath = (entry as { parentPath?: string }).parentPath ?? dir
              const fullPath = path.join(parentPath, entry.name)
              const stat = yield* Effect.tryPromise({
                try: () => fs.stat(fullPath),
                catch: () => null,
              }).pipe(Effect.catch(() => Effect.succeed(null)))
              if (!stat || stat.size > MAX_FILE_SIZE) continue
              const normalized = fullPath.replace(/\\/g, "/")
              diskPathSet.add(normalized)
              diskFiles.push({ absPath: normalized, size: stat.size, mtimeMs: stat.mtimeMs })
              if (diskFiles.length >= MAX_FILE_COUNT) break
            }
            if (diskFiles.length >= MAX_FILE_COUNT) break
          }

          // Load existing DB rows
          const existingRows = yield* db.all<{ path: string; size: number; mtime_ms: number }>(
            sql`SELECT path, size, mtime_ms FROM memory_doc`,
          )
          const dbMap = new Map(existingRows.map((r) => [r.path, r]))

          // Prune
          let removed = 0
          for (const dbPath of dbMap.keys()) {
            if (!diskPathSet.has(dbPath)) {
              yield* db.run(sql`DELETE FROM memory_doc WHERE path = ${dbPath}`)
              removed++
            }
          }

          // Index
          let added = 0
          let updated = 0
          for (const file of diskFiles) {
            const existing = dbMap.get(file.absPath)
            const fingerprint = `${file.size}-${file.mtimeMs}`
            const existingFingerprint = existing ? `${existing.size}-${existing.mtime_ms}` : null
            if (existingFingerprint === fingerprint) continue

            const content = yield* Effect.tryPromise({
              try: () => fs.readFile(file.absPath, "utf-8"),
              catch: () => "",
            }).pipe(Effect.catch(() => Effect.succeed("")))

            const locator = parseMemoryPath(root, file.absPath)
            const kind = locator?.kind ?? "global"
            const scopeId = locator?.scopeId ?? ""
            const title = extractTitle(content, file.absPath)
            const now = Date.now()

            yield* db.run(
              sql`INSERT OR REPLACE INTO memory_doc (path, kind, scope_id, title, content, size, mtime_ms, time_indexed)
                  VALUES (${file.absPath}, ${kind}, ${scopeId}, ${title}, ${content}, ${file.size}, ${file.mtimeMs}, ${now})`,
            )

            if (existing) updated++
            else added++
          }

          return { added, updated, removed }
        }).pipe(Effect.catch(() => Effect.succeed({ added: 0, updated: 0, removed: 0 }))),
      )

    return Service.of({ reconcile })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))
