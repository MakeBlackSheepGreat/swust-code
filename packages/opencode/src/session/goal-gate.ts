import { Effect } from "effect"
import { Goal, MAX_GOAL_REACT } from "./goal"
import { GoalJudge } from "./goal-judge"

export interface GoalGateResult {
  readonly shouldContinue: boolean
  readonly message?: string
}

/**
 * The goal gate is called whenever the agent wants to stop.
 * If a goal is active and the judge says "not satisfied", it returns
 * a synthetic user message to inject and signals the loop should continue.
 *
 * Returns { shouldContinue: false } when:
 * - No active goal
 * - Goal is satisfied (ok) or impossible
 * - Re-entry cap exceeded
 */
export function goalGate(input: {
  readonly sessionID: string
  readonly agentID: string
  readonly goal: Goal.Interface
  readonly judge: GoalJudge.Interface
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>
}): Effect.Effect<GoalGateResult> {
  return Effect.gen(function* () {
    // Only fire for main agent
    if (input.agentID !== "main") {
      return { shouldContinue: false }
    }

    const activeGoal = yield* input.goal.get(input.sessionID)
    if (!activeGoal) {
      return { shouldContinue: false }
    }

    // Call the judge
    const verdict = yield* input.judge.evaluate(activeGoal.condition, input.messages)

    if (verdict.ok) {
      yield* input.goal.clear(input.sessionID)
      yield* Effect.logInfo("Goal satisfied", { sessionID: input.sessionID, reason: verdict.reason })
      return { shouldContinue: false }
    }

    if (verdict.impossible) {
      yield* input.goal.clear(input.sessionID)
      yield* Effect.logInfo("Goal impossible", { sessionID: input.sessionID, reason: verdict.reason })
      return { shouldContinue: false }
    }

    // Check re-entry cap
    const count = yield* input.goal.bumpReact(input.sessionID)
    if (count > MAX_GOAL_REACT) {
      yield* input.goal.clear(input.sessionID)
      yield* Effect.logWarning("Goal re-entry cap exceeded", { sessionID: input.sessionID, count })
      return { shouldContinue: false }
    }

    // Inject synthetic user turn
    const message = [
      `<system-reminder>`,
      `Your goal is not yet satisfied: "${activeGoal.condition}".`,
      `A judge reviewed the transcript and reported what is still missing:`,
      verdict.reason,
      `Keep working toward the goal. Do not stop until it is genuinely met or impossible.`,
      `</system-reminder>`,
    ].join("\n")

    yield* Effect.logInfo("Goal gate: re-entering loop", { sessionID: input.sessionID, count, reason: verdict.reason })

    return { shouldContinue: true, message }
  }).pipe(
    Effect.catch((e: unknown) =>
      Effect.logWarning("Goal gate error - failing open", { error: String(e) }).pipe(
        Effect.as({ shouldContinue: false } as GoalGateResult),
      ),
    ),
  )
}
