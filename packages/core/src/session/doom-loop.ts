/**
 * Doom Loop Detector - prevents infinite identical tool call loops.
 *
 * If the last N tool calls have identical names AND identical inputs,
 * the agent is likely stuck in a loop. This module detects that
 * and signals the run loop to break.
 *
 * Ported from MiMo-Code's session/processor.ts doom loop detection.
 */

export const DOOM_LOOP_THRESHOLD = 3

export interface ToolCallRecord {
  readonly name: string
  readonly input: string
  readonly timestamp: number
}

/**
 * Check if the recent tool calls form a doom loop.
 * Returns true if the last `threshold` calls have identical name+input.
 */
export function isDoomLoop(
  recentCalls: ReadonlyArray<ToolCallRecord>,
  threshold: number = DOOM_LOOP_THRESHOLD,
): boolean {
  if (recentCalls.length < threshold) return false

  const last = recentCalls.slice(-threshold)
  const firstName = last[0].name
  const firstInput = last[0].input

  return last.every(
    (call) => call.name === firstName && call.input === firstInput,
  )
}

/**
 * Extract a tool call record from a message part.
 * Returns null if the part is not a tool call.
 */
export function extractToolCall(
  part: { readonly type?: string; readonly tool?: string; readonly state?: { readonly input?: unknown } },
): ToolCallRecord | null {
  if (part.type !== "tool" || !part.tool) return null
  return {
    name: part.tool,
    input: JSON.stringify(part.state?.input ?? ""),
    timestamp: Date.now(),
  }
}
