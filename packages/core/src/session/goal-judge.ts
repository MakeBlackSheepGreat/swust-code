export * as GoalJudge from "./goal-judge"

import { Context, Effect, Layer } from "effect"
import { LLM, type Model } from "@swust-code/llm"
import { Verdict } from "./goal"

const JUDGE_SYSTEM = `You are an independent judge evaluating whether a coding task's goal has been met.

You will receive:
1. A conversation transcript between a user and a coding assistant
2. A goal/condition that the assistant was trying to achieve

Your job:
- Read the transcript carefully
- Determine if the goal is satisfied, not satisfied, or genuinely impossible
- Be STRICT: partial progress is NOT satisfaction
- Do NOT defer to the assistant's self-assessment of "impossible" - verify independently
- Focus on CONCRETE evidence: code changes, test results, file modifications

Output a JSON verdict with:
- ok: true if the goal is genuinely met
- impossible: true only if the goal CANNOT be met (not just difficult)
- reason: brief explanation of what is still missing or why it's impossible`

export interface Interface {
  readonly evaluate: (input: {
    readonly condition: string
    readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>
    readonly model: Model
  }) => Effect.Effect<Verdict>
  readonly buildPrompt: (
    condition: string,
    messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
  ) => string
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/GoalJudge") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const buildPrompt = (
      condition: string,
      messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
    ): string => {
      const transcript = messages
        .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
        .join("\n\n")

      return [
        JUDGE_SYSTEM,
        "---",
        "CONVERSATION TRANSCRIPT:",
        transcript.slice(0, 4000),
        "---",
        `GOAL TO EVALUATE: ${condition}`,
        "---",
        'Is the goal met? Respond with JSON: { "ok": boolean, "impossible"?: boolean, "reason": string }',
      ].join("\n")
    }

    const evaluate = Effect.fn("GoalJudge.evaluate")(function* (input: {
      readonly condition: string
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>
      readonly model: Model
    }) {
      return yield* LLM.generateObject({
        model: input.model,
        system: JUDGE_SYSTEM,
        prompt: buildPrompt(input.condition, input.messages),
        schema: Verdict,
        generation: { temperature: 0, maxTokens: 500 },
      }).pipe(
        Effect.map((result) => result.object),
        Effect.catch(() =>
          Effect.succeed({
            ok: false,
            impossible: false,
            reason: "Goal judge could not evaluate the transcript; continue until stronger evidence is available.",
          } satisfies Verdict),
        ),
      )
    })

    return Service.of({ evaluate, buildPrompt })
  }),
)

export const defaultLayer = layer
