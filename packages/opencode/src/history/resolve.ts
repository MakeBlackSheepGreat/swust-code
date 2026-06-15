import { Effect } from "effect"
import { eq } from "drizzle-orm"
import type { Database } from "@swust-code/core/database/database"
import { MessageTable, SessionTable } from "@swust-code/core/session/sql"
import type { MessageID, SessionID } from "@/session/schema"

class LRU<K, V> {
  private map = new Map<K, V>()

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }
}

export type Resolver = {
  role: (messageID: string) => Effect.Effect<"user" | "assistant">
  projectID: (sessionID: string) => Effect.Effect<string>
}

export function makeResolver(db: Database.Interface["db"]): Resolver {
  const roleCache = new LRU<string, "user" | "assistant">(1024)
  const projectCache = new LRU<string, string>(512)

  return {
    role: (messageID) =>
      Effect.gen(function* () {
        const cached = roleCache.get(messageID)
        if (cached) return cached
        const row = yield* db
          .select({ data: MessageTable.data })
          .from(MessageTable)
          .where(eq(MessageTable.id, messageID as MessageID))
          .get()
          .pipe(Effect.orDie)
        const role = (row?.data as { role?: string } | undefined)?.role === "user" ? "user" : "assistant"
        roleCache.set(messageID, role)
        return role
      }),

    projectID: (sessionID) =>
      Effect.gen(function* () {
        const cached = projectCache.get(sessionID)
        if (cached) return cached
        const row = yield* db
          .select({ project_id: SessionTable.project_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID as SessionID))
          .get()
          .pipe(Effect.orDie)
        const projectID = row?.project_id ?? ""
        projectCache.set(sessionID, projectID)
        return projectID
      }),
  }
}
