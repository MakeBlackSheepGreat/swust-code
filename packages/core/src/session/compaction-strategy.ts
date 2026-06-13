/**
 * Context Compaction - manage LLM context window after compaction.
 *
 * Three key algorithms:
 * 1. computeBoundary: Determines what gets preserved vs summarized
 * 2. microcompact: Strips bulky tool_result content from compactable tools
 * 3. renderRebuildContext: Assembles memory/checkpoint/notes into context
 *
 * Ported from MiMo-Code's checkpoint.ts patterns.
 */

import { roughTokenCount as estimateTokens } from "./token-estimation"

import {
  TAIL_MIN_TOKENS,
  TAIL_MAX_TOKENS,
  TAIL_MIN_TEXT_BLOCK_MESSAGES,
  COMPACTABLE_TOOL_NAMES,
} from "./checkpoint-templates"

export interface Message {
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly content: string
  readonly toolName?: string
  readonly finishReason?: string
}

export interface BoundaryResult {
  /** Index of the first message to preserve (tail starts here) */
  readonly boundaryIndex: number
  /** Total tokens in the tail */
  readonly tailTokens: number
  /** Number of text-block messages in the tail */
  readonly tailMessageCount: number
}

/**
 * Compute the compaction boundary: everything before is summarized,
 * everything at and after is preserved as the tail.
 *
 * Algorithm:
 * 1. Find the last finished assistant message
 * 2. Start tail at lastAsstIdx - 1, sum tokens forward
 * 3. If tail >= TAIL_MAX: leave as-is (soft ceiling)
 * 4. If tail < TAIL_MIN or < MIN messages: walk backward until both met
 */
export function computeBoundary(messages: ReadonlyArray<Message>): BoundaryResult {
  if (messages.length === 0) {
    return { boundaryIndex: 0, tailTokens: 0, tailMessageCount: 0 }
  }

  // Find last finished assistant message
  let lastAsstIdx = messages.length - 1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].finishReason) {
      lastAsstIdx = i
      break
    }
  }

  // Start tail from lastAsstIdx - 1
  let boundary = Math.max(0, lastAsstIdx - 1)

  // Count tokens forward from boundary
  let tailTokens = 0
  let tailMessages = 0
  for (let i = boundary; i < messages.length; i++) {
    tailTokens += estimateTokens(messages[i].content)
    if (messages[i].role !== "tool") tailMessages++
  }

  // If already at max, leave as-is
  if (tailTokens >= TAIL_MAX_TOKENS) {
    return { boundaryIndex: boundary, tailTokens, tailMessageCount: tailMessages }
  }

  // Walk backward to meet minimums
  while (
    boundary > 0 &&
    (tailTokens < TAIL_MIN_TOKENS || tailMessages < TAIL_MIN_TEXT_BLOCK_MESSAGES) &&
    tailTokens < TAIL_MAX_TOKENS
  ) {
    boundary--
    tailTokens += estimateTokens(messages[boundary].content)
    if (messages[boundary].role !== "tool") tailMessages++
  }

  return { boundaryIndex: boundary, tailTokens, tailMessageCount: tailMessages }
}

/**
 * Microcompact: strip bulky tool_result content from compactable tools
 * in the preserved tail. The tool_use parts are preserved so the LLM
 * still sees what action was taken; only the result body is replaced.
 */
export function microcompact(
  messages: ReadonlyArray<Message>,
  boundaryIndex: number,
): Message[] {
  return messages.map((msg, idx) => {
    if (idx < boundaryIndex) return msg
    if (msg.role !== "tool") return msg
    if (!msg.toolName || !COMPACTABLE_TOOL_NAMES.has(msg.toolName)) return msg

    // Replace content with a placeholder
    return {
      ...msg,
      content: `[${msg.toolName} result compacted - use Read/Grep to re-fetch if needed]`,
    }
  })
}

/**
 * Classify the last message for tail-aware system reminders.
 */
export type LastMessageInfo =
  | { readonly role: "assistant"; readonly finish: "tool-calls" }
  | { readonly role: "assistant"; readonly finish: "stop" }
  | { readonly role: "tool" }
  | { readonly role: "user" }

export function computeLastMessageInfo(
  messages: ReadonlyArray<Message>,
): LastMessageInfo | undefined {
  if (messages.length === 0) return undefined
  const last = messages[messages.length - 1]

  if (last.role === "assistant") {
    return {
      role: "assistant",
      finish: last.finishReason === "tool-calls" ? "tool-calls" : "stop",
    }
  }

  if (last.role === "tool") return { role: "tool" }
  if (last.role === "user") return { role: "user" }
  return undefined
}

/**
 * Generate a system reminder based on the last message state.
 * This guides the LLM on what to do after context rebuild.
 */
export function generateContinuityReminder(
  lastMessage: LastMessageInfo | undefined,
  checkpointSummary?: string,
): string {
  const parts: string[] = []

  if (checkpointSummary) {
    parts.push(
      "The checkpoint and memory above cover earlier conversation.",
      "Messages below are real preserved history, not pseudo-content.",
      "Resume directly. Do not acknowledge the memory dump.",
    )
  }

  if (!lastMessage) return parts.join("\n")

  switch (lastMessage.role) {
    case "assistant":
      if (lastMessage.finish === "tool-calls") {
        parts.push(
          "<system-reminder>",
          "You are mid-loop in an autonomous task. Continue your work loop:",
          "respond to the tool results below and proceed to the next iteration.",
          "</system-reminder>",
        )
      } else {
        parts.push(
          "<system-reminder>",
          "The previous assistant turn ended with a stop. Before stopping again,",
          "review your task checklist. Only stop when tasks are genuinely complete",
          "or you need user input you cannot infer.",
          "</system-reminder>",
        )
      }
      break
    case "tool":
      parts.push(
        "<system-reminder>",
        "Tool results above are real history. Process them and continue",
        "to the next iteration. Do not pause to summarize.",
        "</system-reminder>",
      )
      break
    case "user":
      // No addendum needed
      break
  }

  return parts.join("\n")
}
