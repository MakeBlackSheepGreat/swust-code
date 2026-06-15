import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FSUtil } from "@swust-code/core/fs-util"
import { SessionV1 } from "@swust-code/core/v1/session"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionReminders } from "@/session/reminders"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(RuntimeFlags.layer(), FSUtil.defaultLayer, Layer.mock(Session.Service)({})),
)

function userMessage(agent?: string): SessionV1.WithParts {
  const sessionID = SessionID.make("ses_reminders")
  const messageID = MessageID.make("msg_reminders")
  return {
    info: {
      id: messageID,
      sessionID,
      role: "user",
      agent,
      time: { created: Date.now() },
    },
    parts: [
      {
        id: "prt_reminders" as any,
        messageID,
        sessionID,
        type: "text",
        text: "Do the work",
      },
    ],
  } as SessionV1.WithParts
}

describe("SessionReminders", () => {
  it.effect("injects compose prompt and compose skill catalog", () =>
    Effect.gen(function* () {
      const messages = [userMessage("compose")]
      const applied = yield* SessionReminders.apply({
        messages,
        agent: { name: "compose" } as Agent.Info,
        session: {} as Session.Info,
      })
      const first = applied[0].parts[0]
      expect(first.type).toBe("text")
      if (first.type === "text") {
        expect(first.synthetic).toBe(true)
        expect(first.text).toContain("SWUST Code Compose Agent")
        expect(first.text).toContain("<compose_skills>")
        expect(first.text).toContain("<name>compose:brainstorm</name>")
      }
    }),
  )

  it.effect("injects compose prompt based on the message agent", () =>
    Effect.gen(function* () {
      const messages = [userMessage("compose")]
      const applied = yield* SessionReminders.apply({
        messages,
        agent: { name: "build" } as Agent.Info,
        session: {} as Session.Info,
      })
      const first = applied[0].parts[0]
      expect(first.type).toBe("text")
      if (first.type === "text") {
        expect(first.synthetic).toBe(true)
        expect(first.text).toContain("SWUST Code Compose Agent")
      }
    }),
  )

  it.effect("injects goal mode prompt for the goal agent", () =>
    Effect.gen(function* () {
      const messages = [userMessage("goal")]
      const applied = yield* SessionReminders.apply({
        messages,
        agent: { name: "goal" } as Agent.Info,
        session: {} as Session.Info,
      })
      const first = applied[0].parts[0]
      expect(first.type).toBe("text")
      if (first.type === "text") {
        expect(first.synthetic).toBe(true)
        expect(first.text).toContain("Goal mode is active")
      }
    }),
  )
})
