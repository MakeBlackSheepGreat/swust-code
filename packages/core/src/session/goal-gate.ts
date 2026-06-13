import { Effect } from "effect"
import { type GoalInfo, MAX_GOAL_REACT } from "./goal"
import type { Verdict } from "./goal"

export interface GoalGateResult {
  readonly shouldContinue: boolean
  readonly message?: string
}

export interface GoalGateInput {
  readonly sessionID: string
  readonly agentID: string
  readonly getGoal: (sessionID: string) => Effect.Effect<GoalInfo | undefined>
  readonly clearGoal: (sessionID: string) => Effect.Effect<void>
  readonly bumpReact: (sessionID: string) => Effect.Effect<number>
  readonly evaluate: (condition: string, messages: ReadonlyArray<{ readonly role: string; readonly content: string }>) => Effect.Effect<Verdict>
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>
}

export function goalGate(input: GoalGateInput): Effect.Effect<GoalGateResult> {
  return Effect.gen(function* () {
    if (input.agentID !== "main") {
      return { shouldContinue: false }
    }

    const activeGoal = yield* input.getGoal(input.sessionID)
    if (!activeGoal) {
      return { shouldContinue: false }
    }

    const verdict = yield* input.evaluate(activeGoal.condition, input.messages)

    if (verdict.ok) {
      yield* input.clearGoal(input.sessionID)
      return { shouldContinue: false }
    }

    if (verdict.impossible) {
      yield* input.clearGoal(input.sessionID)
      return { shouldContinue: false }
    }

    const count = yield* input.bumpReact(input.sessionID)
    if (count > MAX_GOAL_REACT) {
      yield* input.clearGoal(input.sessionID)
      return { shouldContinue: false }
    }

    const message = [
      `<system-reminder>`,
      `Your goal is not yet satisfied: "${activeGoal.condition}".`,
      `A judge reviewed the transcript and reported what is still missing:`,
      verdict.reason,
      `Keep working toward the goal. Do not stop until it is genuinely met or impossible.`,
      `</system-reminder>`,
    ].join("\n")

    return { shouldContinue: true, message }
  }).pipe(
    Effect.catch(() => Effect.succeed({ shouldContinue: false } as GoalGateResult)),
  )
}
