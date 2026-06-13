export * as MemoryContext from "./context"

import path from "path"
import fs from "fs"
import { Context, Effect, Layer, Schema } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "../database/database"
import { Global } from "../global"
import { SystemContext } from "../system-context/index"
import { memoryRoot, ensureDirs } from "./paths"
import { resolveImports } from "./import-resolver"

const MAX_INJECT_BYTES = 4096

const State = Schema.Struct({
  fileCount: Schema.Number,
  memoryMdLength: Schema.Number,
})
type State = typeof State.Type

function render(state: State): string {
  const parts: string[] = []

  if (state.fileCount === 0) {
    parts.push(
      "No memory files found yet. Create markdown files under the memory directory",
      "to persist project knowledge across sessions.",
    )
  } else {
    parts.push(
      `You have ${state.fileCount} memory file(s) indexed. Use the "memory" tool to search`,
      "persistent project knowledge when relevant.",
    )
  }

  return parts.join(" ")
}

export interface Interface {
  readonly load: () => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/MemoryContext") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const db = (yield* Database.Service).db
    const root = memoryRoot(global.data)

    yield* ensureDirs(root)

    return Service.of({
      load: () =>
        Effect.sync(() => {
          const rowsEffect = db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM memory_doc`)
          const rows = Effect.runSync(rowsEffect.pipe(Effect.catch(() => Effect.succeed([{ count: 0 }]))))
          const fileCount = rows[0]?.count ?? 0

          // Read MEMORY.md and resolve @path imports
          let memoryMdContent = ""
          try {
            const memoryMdPath = path.join(root, "global", "MEMORY.md")
            const raw = fs.readFileSync(memoryMdPath, "utf-8")
            const resolved = resolveImports(raw, path.dirname(memoryMdPath))
            memoryMdContent = resolved.length <= MAX_INJECT_BYTES
              ? resolved
              : resolved.slice(0, MAX_INJECT_BYTES) + "\n... (truncated)"
          } catch {
            // No MEMORY.md yet
          }

          return SystemContext.make({
            key: SystemContext.Key.make("core/memory"),
            codec: Schema.toCodecJson(State),
            load: Effect.succeed({ fileCount, memoryMdLength: memoryMdContent.length }),
            baseline: (state) => {
              const guidance = render(state)
              if (memoryMdContent) {
                return `${guidance}\n\n## Global Memory (MEMORY.md)\n${memoryMdContent}`
              }
              return guidance
            },
            update: (_prev, current) => render(current),
            removed: () => "Memory system is no longer available.",
          })
        }),
    })
  }),
)

export const locationLayer = layer.pipe(
  Layer.provide(Database.defaultLayer),
  Layer.provide(Global.defaultLayer),
)
