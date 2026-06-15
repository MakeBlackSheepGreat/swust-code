/**
 * Actor Registry - MiMo-compatible lifecycle tracking for actors.
 *
 * Actor rows are persisted in SQLite so actor status, wait/cancel lookup, and
 * inbox receiver validation survive process restarts.
 */

import { and, asc, eq, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "@swust-code/core/database/database"
import { LayerNode } from "@swust-code/core/effect/layer-node"
import { ActorRegistryTable, type ActorRegistryRow } from "./actor.sql"

export type ActorStatus = "pending" | "running" | "idle" | "cancelled" | "failed"
export type ActorMode = "peer" | "subagent"
export type ActorLifecycle = "ephemeral" | "persistent"
export type ActorOutcome = "success" | "failure" | "cancelled"

export interface Actor {
  readonly sessionID: string
  readonly actorID: string
  readonly mode: ActorMode
  readonly parentActorID?: string
  readonly status: ActorStatus
  readonly lastOutcome?: ActorOutcome
  readonly lifecycle: ActorLifecycle
  readonly agent: string
  readonly description?: string
  readonly background: boolean
  readonly turnCount: number
  readonly lastTurnTime: number
  readonly lastError?: string
  readonly timeCreated: number
  readonly timeCompleted?: number
}

export interface Interface {
  readonly register: (actor: Omit<Actor, "turnCount" | "lastTurnTime" | "timeCreated">) => Effect.Effect<void>
  readonly updateStatus: (
    sessionID: string,
    actorID: string,
    status: ActorStatus,
    outcome?: ActorOutcome,
    error?: string,
  ) => Effect.Effect<void>
  readonly updateTurn: (sessionID: string, actorID: string) => Effect.Effect<void>
  readonly get: (sessionID: string, actorID: string) => Effect.Effect<Actor | undefined>
  readonly listBySession: (sessionID: string) => Effect.Effect<ReadonlyArray<Actor>>
  readonly listActive: () => Effect.Effect<ReadonlyArray<Actor>>
  readonly listByParent: (sessionID: string, parentActorID: string) => Effect.Effect<ReadonlyArray<Actor>>
  readonly allocateActorID: (sessionID: string, agentType: string) => Effect.Effect<string>
  readonly renderForAgent: (sessionID: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/ActorRegistry") {}

function fromRow(row: ActorRegistryRow): Actor {
  return {
    sessionID: row.session_id,
    actorID: row.actor_id,
    mode: row.mode,
    ...(row.parent_actor_id ? { parentActorID: row.parent_actor_id } : {}),
    status: row.status,
    ...(row.last_outcome ? { lastOutcome: row.last_outcome } : {}),
    lifecycle: row.lifecycle,
    agent: row.agent,
    ...(row.description ? { description: row.description } : {}),
    background: row.background,
    turnCount: row.turn_count,
    lastTurnTime: row.last_turn_time,
    ...(row.last_error ? { lastError: row.last_error } : {}),
    timeCreated: row.time_created,
    ...(row.time_completed ? { timeCompleted: row.time_completed } : {}),
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const register = Effect.fn("ActorRegistry.register")(function* (
      actor: Omit<Actor, "turnCount" | "lastTurnTime" | "timeCreated">,
    ) {
      const now = Date.now()
      yield* db
        .delete(ActorRegistryTable)
        .where(and(eq(ActorRegistryTable.session_id, actor.sessionID), eq(ActorRegistryTable.actor_id, actor.actorID)))
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(ActorRegistryTable)
        .values({
          session_id: actor.sessionID,
          actor_id: actor.actorID,
          mode: actor.mode,
          parent_actor_id: actor.parentActorID ?? null,
          status: actor.status,
          last_outcome: actor.lastOutcome ?? null,
          lifecycle: actor.lifecycle,
          agent: actor.agent,
          description: actor.description ?? null,
          background: actor.background,
          last_turn_time: now,
          turn_count: 0,
          last_error: actor.lastError ?? null,
          time_created: now,
          time_updated: now,
          time_completed: actor.timeCompleted ?? null,
        })
        .run()
        .pipe(Effect.orDie)
    })

    const updateStatus = Effect.fn("ActorRegistry.updateStatus")(function* (
      sessionID: string,
      actorID: string,
      status: ActorStatus,
      outcome?: ActorOutcome,
      error?: string,
    ) {
      const now = Date.now()
      const terminal = status === "idle" || status === "failed" || status === "cancelled"
      yield* db
        .update(ActorRegistryTable)
        .set({
          status,
          time_updated: now,
          ...(terminal ? { time_completed: now } : {}),
          ...(outcome !== undefined ? { last_outcome: outcome } : {}),
          ...(error !== undefined
            ? { last_error: error }
            : outcome !== undefined && outcome !== "failure"
              ? { last_error: null }
              : {}),
        })
        .where(and(eq(ActorRegistryTable.session_id, sessionID), eq(ActorRegistryTable.actor_id, actorID)))
        .run()
        .pipe(Effect.orDie)
    })

    const updateTurn = Effect.fn("ActorRegistry.updateTurn")(function* (sessionID: string, actorID: string) {
      const now = Date.now()
      yield* db
        .update(ActorRegistryTable)
        .set({
          last_turn_time: now,
          turn_count: sql`${ActorRegistryTable.turn_count} + 1`,
          time_updated: now,
        })
        .where(and(eq(ActorRegistryTable.session_id, sessionID), eq(ActorRegistryTable.actor_id, actorID)))
        .run()
        .pipe(Effect.orDie)
    })

    const get = Effect.fn("ActorRegistry.get")(function* (sessionID: string, actorID: string) {
      const row = yield* db
        .select()
        .from(ActorRegistryTable)
        .where(and(eq(ActorRegistryTable.session_id, sessionID), eq(ActorRegistryTable.actor_id, actorID)))
        .get()
        .pipe(Effect.orDie)
      return row ? fromRow(row) : undefined
    })

    const listBySession = Effect.fn("ActorRegistry.listBySession")(function* (sessionID: string) {
      const rows = yield* db
        .select()
        .from(ActorRegistryTable)
        .where(eq(ActorRegistryTable.session_id, sessionID))
        .orderBy(asc(ActorRegistryTable.actor_id))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    const listActive = Effect.fn("ActorRegistry.listActive")(function* () {
      const rows = yield* db
        .select()
        .from(ActorRegistryTable)
        .where(
          and(
            or(eq(ActorRegistryTable.status, "pending"), eq(ActorRegistryTable.status, "running")),
            eq(ActorRegistryTable.background, true),
          ),
        )
        .orderBy(asc(ActorRegistryTable.last_turn_time))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    const listByParent = Effect.fn("ActorRegistry.listByParent")(function* (sessionID: string, parentActorID: string) {
      const rows = yield* db
        .select()
        .from(ActorRegistryTable)
        .where(
          and(eq(ActorRegistryTable.session_id, sessionID), eq(ActorRegistryTable.parent_actor_id, parentActorID)),
        )
        .orderBy(asc(ActorRegistryTable.actor_id))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    const allocateActorID = Effect.fn("ActorRegistry.allocateActorID")(function* (sessionID: string, agentType: string) {
      const rows = yield* db
        .select({ actorID: ActorRegistryTable.actor_id })
        .from(ActorRegistryTable)
        .where(and(eq(ActorRegistryTable.session_id, sessionID), eq(ActorRegistryTable.agent, agentType)))
        .all()
        .pipe(Effect.orDie)
      const existing = new Set(rows.map((row) => row.actorID))
      let counter = 1
      while (existing.has(`${agentType}-${counter}`)) counter++
      return `${agentType}-${counter}`
    })

    const renderForAgent = Effect.fn("ActorRegistry.renderForAgent")(function* (sessionID: string) {
      const active = yield* listBySession(sessionID).pipe(
        Effect.map((actors) => actors.filter((actor) => actor.status === "pending" || actor.status === "running")),
      )
      if (active.length === 0) return ""
      const lines = ["## Active Background Agents\n"]
      for (const actor of active) {
        const idle = Date.now() - actor.lastTurnTime
        const idleStr = idle > 60_000 ? ` (idle ${Math.round(idle / 60_000)}m)` : ""
        lines.push(`- **${actor.actorID}** [${actor.agent}]${idleStr}: ${actor.description ?? "working"}`)
      }
      return lines.join("\n")
    })

    return Service.of({
      register,
      updateStatus,
      updateTurn,
      get,
      listBySession,
      listActive,
      listByParent,
      allocateActorID,
      renderForAgent,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.defaultLayer))

export const node = LayerNode.make(layer, [Database.node])

export * as ActorRegistry from "./registry"
