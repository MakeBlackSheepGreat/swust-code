/**
 * Task Gate - secondary stop condition for autonomous loops.
 *
 * When the agent wants to stop, the task gate checks if there are
 * non-terminal tasks (status !== "completed" && status !== "cancelled").
 * If incomplete tasks exist, the gate forces the agent to continue.
 */

export interface TaskInfo {
  readonly content: string
  readonly status: string
  readonly priority?: string
}

export interface TaskGateResult {
  readonly shouldContinue: boolean
  readonly message?: string
}

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "done"])

const MAX_GOAL_REACT = 12

export function taskGate(tasks: ReadonlyArray<TaskInfo>): TaskGateResult {
  if (tasks.length === 0) {
    return { shouldContinue: false }
  }

  const nonTerminal = tasks.filter((t) => !TERMINAL_STATUSES.has(t.status))

  if (nonTerminal.length === 0) {
    return { shouldContinue: false }
  }

  const taskList = nonTerminal
    .map((t) => {
      const priority = t.priority ? ` [${t.priority}]` : ""
      return `- ${t.status === "in_progress" ? "[in-progress]" : "[pending]"}${priority} ${t.content}`
    })
    .join("\n")

  const message = [
    "<system-reminder>",
    `You have ${nonTerminal.length} incomplete task(s):`,
    "",
    taskList,
    "",
    "Continue working on these tasks before stopping.",
    "Complete or cancel each task before declaring the work done.",
    "</system-reminder>",
  ].join("\n")

  return { shouldContinue: true, message }
}

export function isReEntryCapExceeded(count: number): boolean {
  return count > MAX_GOAL_REACT
}
