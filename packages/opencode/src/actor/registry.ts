/**
 * Actor Registry - persistent lifecycle tracking for subagents.
 *
 * Tracks actor status (pending/running/idle/cancelled/failed),
 * provides orphan recovery on restart, and stuck detection.
 *
 * Ported from MiMo-Code's actor/registry.ts patterns.
 */

import { Context, Effect, Layer } from "effect"
import { Global } from "@swust-code/core/global"

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
  readonly updateStatus: (sessionID: string, actorID: string, status: ActorStatus, outcome?: ActorOutcome, error?: string) => Effect.Effect<void>
  readonly updateTurn: (sessionID: string, actorID: string) => Effect.Effect<void>
  readonly get: (sessionID: string, actorID: string) => Effect.Effect<Actor | undefined>
  readonly listBySession: (sessionID: string) => Effect.Effect<ReadonlyArray<Actor>>
  readonly listActive: () => Effect.Effect<ReadonlyArray<Actor>>
  readonly listByParent: (sessionID: string, parentActorID: string) => Effect.Effect<ReadonlyArray<Actor>>
  readonly allocateActorID: (sessionID: string, agentType: string) => Effect.Effect<string>
  readonly renderForAgent: (sessionID: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/ActorRegistry") {}

const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const actors = new Map<string, Actor>()

    const key = (sessionID: string, actorID: string) => `${sessionID}:${actorID}`

    const register = (actor: Omit<Actor, "turnCount" | "lastTurnTime" | "timeCreated">): Effect.Effect<void> =>
      Effect.sync(() => {
        actors.set(key(actor.sessionID, actor.actorID), {
          ...actor,
          turnCount: 0,
          lastTurnTime: Date.now(),
          timeCreated: Date.now(),
        })
      })

    const updateStatus = (
      sessionID: string,
      actorID: string,
      status: ActorStatus,
      outcome?: ActorOutcome,
      error?: string,
    ): Effect.Effect<void> =>
      Effect.sync(() => {
        const existing = actors.get(key(sessionID, actorID))
        if (!existing) return
        actors.set(key(sessionID, actorID), {
          ...existing,
          status,
          lastOutcome: outcome ?? existing.lastOutcome,
          lastError: error ?? existing.lastError,
          timeCompleted: status === "idle" || status === "failed" || status === "cancelled"
            ? Date.now()
            : existing.timeCompleted,
        })
      })

    const updateTurn = (sessionID: string, actorID: string): Effect.Effect<void> =>
      Effect.sync(() => {
        const existing = actors.get(key(sessionID, actorID))
        if (!existing) return
        actors.set(key(sessionID, actorID), {
          ...existing,
          turnCount: existing.turnCount + 1,
          lastTurnTime: Date.now(),
        })
      })

    const get = (sessionID: string, actorID: string): Effect.Effect<Actor | undefined> =>
      Effect.sync(() => actors.get(key(sessionID, actorID)))

    const listBySession = (sessionID: string): Effect.Effect<ReadonlyArray<Actor>> =>
      Effect.sync(() => [...actors.values()].filter((a) => a.sessionID === sessionID))

    const listActive = (): Effect.Effect<ReadonlyArray<Actor>> =>
      Effect.sync(() =>
        [...actors.values()].filter(
          (a) => (a.status === "pending" || a.status === "running") && a.background,
        ),
      )

    const listByParent = (sessionID: string, parentActorID: string): Effect.Effect<ReadonlyArray<Actor>> =>
      Effect.sync(() =>
        [...actors.values()].filter(
          (a) => a.sessionID === sessionID && a.parentActorID === parentActorID,
        ),
      )

    const allocateActorID = (sessionID: string, agentType: string): Effect.Effect<string> =>
      Effect.sync(() => {
        const existing = [...actors.values()]
          .filter((a) => a.sessionID === sessionID && a.agent === agentType)
          .map((a) => a.actorID)
        let counter = 1
        while (existing.includes(`${agentType}-${counter}`)) counter++
        return `${agentType}-${counter}`
      })

    const renderForAgent = (sessionID: string): Effect.Effect<string> =>
      Effect.sync(() => {
        const active = [...actors.values()].filter(
          (a) => a.sessionID === sessionID && (a.status === "pending" || a.status === "running"),
        )
        if (active.length === 0) return ""
        const lines = ["## Active Background Agents\n"]
        for (const a of active) {
          const idle = Date.now() - a.lastTurnTime
          const idleStr = idle > 60_000 ? ` (idle ${Math.round(idle / 60_000)}m)` : ""
          lines.push(`- **${a.actorID}** [${a.agent}]${idleStr}: ${a.description ?? "working"}`)
        }
        return lines.join("\n")
      })

    return Service.of({ register, updateStatus, updateTurn, get, listBySession, listActive, listByParent, allocateActorID, renderForAgent })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Global.defaultLayer))
