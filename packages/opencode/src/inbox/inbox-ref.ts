import type { SessionV1 } from "@swust-code/core/v1/session"
import type { Effect } from "effect"
import type { SessionID } from "@/session/schema"
import type { Interface } from "./inbox"

export interface SessionPromptLoopRef {
  loop: (input: { sessionID: SessionID; agentID: string }) => Effect.Effect<SessionV1.WithParts>
}

export const sessionPromptRef: { current: SessionPromptLoopRef | undefined } = {
  current: undefined,
}

export const inboxServiceRef: { current: Interface | undefined } = {
  current: undefined,
}
