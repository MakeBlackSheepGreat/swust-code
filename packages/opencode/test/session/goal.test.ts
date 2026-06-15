import { expect } from "bun:test"
import { Effect } from "effect"

import { Goal, MAX_GOAL_REACT } from "../../src/session/goal"
import { testEffect } from "../lib/effect"

const it = testEffect(Goal.defaultLayer)

it.instance("tracks goal lifecycle for a session", () =>
  Effect.gen(function* () {
    const goal = yield* Goal.Service
    const sessionID = "ses_goal_test"

    expect(yield* goal.get(sessionID)).toBeUndefined()

    yield* goal.set(sessionID, "finish the requested change")
    expect(yield* goal.get(sessionID)).toEqual({
      condition: "finish the requested change",
      react: 0,
    })

    expect(yield* goal.bumpReact(sessionID)).toBe(1)
    expect(yield* goal.get(sessionID)).toEqual({
      condition: "finish the requested change",
      react: 1,
    })

    yield* goal.clear(sessionID)
    expect(yield* goal.get(sessionID)).toBeUndefined()
  }),
)

it.effect("keeps the goal re-entry cap explicit", () =>
  Effect.sync(() => {
    expect(MAX_GOAL_REACT).toBe(12)
  }),
)
