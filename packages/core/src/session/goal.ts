export * as Goal from "./goal"

import { Context, Effect, Layer, Schema } from "effect"

export const Verdict = Schema.Struct({
  ok: Schema.Boolean,
  impossible: Schema.optional(Schema.Boolean),
  reason: Schema.String,
})
export type Verdict = typeof Verdict.Type

export interface GoalInfo {
  readonly condition: string
  readonly react: number
}

export interface Interface {
  readonly set: (sessionID: string, condition: string) => Effect.Effect<void>
  readonly get: (sessionID: string) => Effect.Effect<GoalInfo | undefined>
  readonly clear: (sessionID: string) => Effect.Effect<void>
  readonly bumpReact: (sessionID: string) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Goal") {}

const MAX_GOAL_REACT = 12

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const goals = new Map<string, GoalInfo>()

    const set = (sessionID: string, condition: string): Effect.Effect<void> =>
      Effect.sync(() => {
        goals.set(sessionID, { condition, react: 0 })
      })

    const get = (sessionID: string): Effect.Effect<GoalInfo | undefined> =>
      Effect.sync(() => goals.get(sessionID))

    const clear = (sessionID: string): Effect.Effect<void> =>
      Effect.sync(() => {
        goals.delete(sessionID)
      })

    const bumpReact = (sessionID: string): Effect.Effect<number> =>
      Effect.sync(() => {
        const goal = goals.get(sessionID)
        if (!goal) return 0
        const newReact = goal.react + 1
        goals.set(sessionID, { ...goal, react: newReact })
        return newReact
      })

    return Service.of({ set, get, clear, bumpReact })
  }),
)

export const defaultLayer = layer

export { MAX_GOAL_REACT }
