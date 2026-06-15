export * as Goal from "./goal"

import { LayerNode } from "@swust-code/core/effect/layer-node"
import { Context, Effect, Layer, Schema } from "effect"
import { generateObject, streamObject, type ModelMessage } from "ai"
import z from "zod"
import { InstanceState } from "@/effect/instance-state"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { MessageV2 } from "./message-v2"
import { SessionV1 } from "@swust-code/core/v1/session"
import { ModelV2 } from "@swust-code/core/model"
import { ProviderV2 } from "@swust-code/core/provider"

export const Verdict = Schema.Struct({
  ok: Schema.Boolean,
  impossible: Schema.optional(Schema.Boolean),
  reason: Schema.String,
})
export type Verdict = typeof Verdict.Type

const VerdictObject = z.object({
  ok: z.boolean(),
  impossible: z.boolean().optional(),
  reason: z.string(),
})

export interface Goal {
  readonly condition: string
  readonly react: number
}

export interface Interface {
  readonly set: (sessionID: string, condition: string) => Effect.Effect<void>
  readonly get: (sessionID: string) => Effect.Effect<Goal | undefined>
  readonly clear: (sessionID: string) => Effect.Effect<void>
  readonly bumpReact: (sessionID: string) => Effect.Effect<number>
  readonly evaluate: (input: {
    readonly condition: string
    readonly msgs: SessionV1.WithParts[]
    readonly model: { readonly providerID: ProviderV2.ID; readonly modelID: ModelV2.ID }
  }) => Effect.Effect<Verdict, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Goal") {}

const MAX_GOAL_REACT = 12

const JUDGE_SYSTEM = `You are evaluating a stop-condition hook in SWUST Code. Read the conversation transcript carefully, then judge whether the user-provided condition is satisfied.

Your response must be a JSON object with one of these shapes:
- {"ok": true, "reason": "<quote evidence from the transcript that satisfies the condition>"}
- {"ok": false, "reason": "<quote what is missing or what blocks the condition>"}
- {"ok": false, "impossible": true, "reason": "<explain why the condition can never be satisfied>"}

Always include a "reason" field, quoting specific text from the transcript whenever possible. If the transcript does not contain clear evidence that the condition is satisfied, return {"ok": false, "reason": "insufficient evidence in transcript"}.

Only use {"ok": false, "impossible": true} when the condition is genuinely unachievable in this session: for example, the condition is self-contradictory, depends on an unavailable resource or capability, or the assistant has explicitly tried and exhausted reasonable approaches. The assistant claiming the goal is impossible is evidence, not proof. When in doubt, return {"ok": false} without "impossible".`

const judgeUser = (condition: string) =>
  `Based on the conversation transcript above, has the following stopping condition been satisfied? Answer based on transcript evidence only.

Condition: ${condition}`

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const auth = yield* Auth.Service
    const config = yield* Config.Service

    const state = yield* InstanceState.make(
      Effect.fn("SessionGoal.state")(function* () {
        return { goals: new Map<string, Goal>() }
      }),
    )

    const set = (sessionID: string, condition: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        data.goals.set(sessionID, { condition, react: 0 })
        yield* Effect.logInfo("Goal set", { sessionID, condition })
      })

    const get = (sessionID: string): Effect.Effect<Goal | undefined> =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        return data.goals.get(sessionID)
      })

    const clear = (sessionID: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        data.goals.delete(sessionID)
        yield* Effect.logInfo("Goal cleared", { sessionID })
      })

    const bumpReact = (sessionID: string): Effect.Effect<number> =>
      Effect.gen(function* () {
        const data = yield* InstanceState.get(state)
        const goal = data.goals.get(sessionID)
        if (!goal) return 0
        const newReact = goal.react + 1
        data.goals.set(sessionID, { ...goal, react: newReact })
        return newReact
      })

    const evaluate = Effect.fn("SessionGoal.evaluate")(function* (input: {
      readonly condition: string
      readonly msgs: SessionV1.WithParts[]
      readonly model: { readonly providerID: ProviderV2.ID; readonly modelID: ModelV2.ID }
    }) {
      const cfg = yield* config.get()
      const resolved = yield* provider.getModel(input.model.providerID, input.model.modelID)
      const language = yield* provider.getLanguage(resolved)
      const authInfo = yield* auth.get(input.model.providerID).pipe(Effect.orDie)
      const isOpenaiOauth = input.model.providerID === "openai" && authInfo?.type === "oauth"
      const conversation = yield* MessageV2.toModelMessagesEffect(input.msgs, resolved)
      const messages = [
        ...(isOpenaiOauth ? [] : [{ role: "system", content: JUDGE_SYSTEM } satisfies ModelMessage]),
        ...conversation,
        { role: "user", content: judgeUser(input.condition) } satisfies ModelMessage,
      ]

      yield* Effect.logDebug("Goal judge transcript", {
        condition: input.condition,
        messageCount: messages.length,
      })

      const params = {
        experimental_telemetry: {
          isEnabled: cfg.experimental?.openTelemetry,
          metadata: { userId: cfg.username ?? "unknown" },
        },
        temperature: 0,
        messages,
        model: language,
        schema: VerdictObject,
      } satisfies Parameters<typeof generateObject>[0]

      if (isOpenaiOauth) {
        return yield* Effect.promise(async () => {
          const result = streamObject({
            ...params,
            providerOptions: ProviderTransform.providerOptions(resolved, {
              instructions: JUDGE_SYSTEM,
              store: false,
            }),
            onError: () => {},
          })
          for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error
          }
          return await result.object
        }).pipe(Effect.map((result) => result as Verdict))
      }

      return yield* Effect.promise(() => generateObject(params).then((result) => result.object)).pipe(
        Effect.map((result) => result as Verdict),
      )
    })

    return Service.of({ set, get, clear, bumpReact, evaluate })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
)

export const node = LayerNode.make(layer, [Provider.node, Auth.node, Config.node])

export { MAX_GOAL_REACT }
