import { Effect } from "effect"
import { TaskRegistry } from "./registry"
import type { SessionID } from "@/session/schema"

export const MAX_TASK_GATE_SUBAGENT_REACT = 2
export const MAX_TASK_GATE_MAIN_REACT = 3

export type GateMode = "subagent" | "main"

export type Decision =
  | { needReentry: false; capExceeded: false; incompleteTasks: [] }
  | { needReentry: true; reentryText: string; incompleteTasks: string[]; capExceeded: false }
  | { needReentry: false; capExceeded: true; incompleteTasks: string[] }

export interface DecideInput {
  session_id: SessionID
  owner?: string
  reactCount: number
  maxReact: number
  mode: GateMode
}

const buildReentryText = (
  incomplete: { id: string; status: string; summary: string }[],
  mode: GateMode,
): string => {
  const headline =
    mode === "subagent"
      ? "You are about to finish, but these tasks you own are still unfinished:"
      : "You are about to finish, but these tasks in this session are still unfinished:"
  const closingLine =
    mode === "subagent"
      ? "Then re-emit your final message starting with the **Status**/**Summary** header."
      : "Then continue or respond."
  return [
    "<system-reminder>",
    headline,
    ...incomplete.map((task) => `- ${task.id} (${task.status}): ${task.summary}`),
    "For EACH: complete the work then `task done <id> <summary>`, or `task abandon <id> <reason>` if it is genuinely not needed.",
    closingLine,
    "</system-reminder>",
  ].join("\n")
}

export const decide = Effect.fn("TaskGate.decide")(function* (input: DecideInput) {
  const reg = yield* TaskRegistry.Service
  const tasks = yield* reg
    .list({
      session_id: input.session_id,
      owner: input.owner,
      include_terminal: false,
    })
    .pipe(Effect.orElseSucceed(() => []))

  const actionable = tasks.filter((task) => task.status === "open" || task.status === "in_progress")

  if (actionable.length === 0) {
    return { needReentry: false, capExceeded: false, incompleteTasks: [] } satisfies Decision
  }

  if (input.reactCount >= input.maxReact) {
    return {
      needReentry: false,
      capExceeded: true,
      incompleteTasks: actionable.map((task) => task.id),
    } satisfies Decision
  }

  return {
    needReentry: true,
    capExceeded: false,
    reentryText: buildReentryText(actionable, input.mode),
    incompleteTasks: actionable.map((task) => task.id),
  } satisfies Decision
})

export * as TaskGate from "./gate"
