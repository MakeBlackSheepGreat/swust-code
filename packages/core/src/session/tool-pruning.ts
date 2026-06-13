/**
 * Tool Output Pruning - mark old tool outputs as compacted to free context.
 *
 * Walks backwards through messages. After protecting the most recent
 * N tokens of tool output, older tool outputs are replaced with a
 * placeholder. Non-compactable tools (skill, memory, task) are preserved.
 *
 * Ported from DevEco Code's session/compaction.ts patterns.
 */

/** Minimum token threshold before pruning starts */
export const PRUNE_MINIMUM = 20_000

/** Tokens of recent tool output to protect from pruning */
export const PRUNE_PROTECT = 40_000

/** Tools whose output must never be pruned */
export const PRUNE_PROTECTED_TOOLS = new Set([
  "skill",
  "memory",
  "memory_write",
  "task",
  "question",
  "todowrite",
])

/** Tools whose output is safe to prune (large and regeneratable) */
export const PRUNEABLE_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "glob",
  "webfetch",
  "websearch",
  "edit",
  "write",
  "multiedit",
  "apply_patch",
  "codesearch",
])

export interface PrunableMessage {
  readonly role: string
  readonly content: string
  readonly toolName?: string
  readonly isCompacted?: boolean
}

export interface PruneResult {
  readonly prunedCount: number
  readonly savedTokens: number
  readonly messages: ReadonlyArray<PrunableMessage>
}

/**
 * Estimate tokens for a message content string.
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

/**
 * Prune old tool outputs to free context space.
 *
 * Algorithm:
 * 1. Walk backwards through messages
 * 2. Count tool output tokens, protecting the most recent PRUNE_PROTECT tokens
 * 3. Older tool outputs from pruneable tools are replaced with placeholders
 * 4. Protected tools are never pruned
 * 5. Pruning only starts when total tool output exceeds PRUNE_MINIMUM
 */
export function pruneToolOutputs(
  messages: ReadonlyArray<PrunableMessage>,
): PruneResult {
  // Calculate total tool output tokens
  let totalToolTokens = 0
  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolName && !msg.isCompacted) {
      totalToolTokens += estimateTokens(msg.content)
    }
  }

  // Don't prune if below minimum
  if (totalToolTokens < PRUNE_MINIMUM) {
    return { prunedCount: 0, savedTokens: 0, messages }
  }

  const result: PrunableMessage[] = [...messages]
  let protectedTokens = 0
  let prunedCount = 0
  let savedTokens = 0

  // Walk backwards, protecting recent tool output
  for (let i = result.length - 1; i >= 0; i--) {
    const msg = result[i]
    if (msg.role !== "tool" || !msg.toolName || msg.isCompacted) continue

    const tokens = estimateTokens(msg.content)

    // Protected tools are never pruned
    if (PRUNE_PROTECTED_TOOLS.has(msg.toolName)) {
      protectedTokens += tokens
      continue
    }

    // Protect recent tool output up to PRUNE_PROTECT tokens
    if (protectedTokens < PRUNE_PROTECT) {
      protectedTokens += tokens
      continue
    }

    // Prune this tool output
    if (PRUNEABLE_TOOLS.has(msg.toolName)) {
      result[i] = {
        ...msg,
        content: `[${msg.toolName} output pruned - use the tool again if needed]`,
        isCompacted: true,
      }
      prunedCount++
      savedTokens += tokens
    }
  }

  return { prunedCount, savedTokens, messages: result }
}
