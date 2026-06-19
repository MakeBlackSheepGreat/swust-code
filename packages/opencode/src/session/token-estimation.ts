/**
 * Token Estimation - three-layer token counting for context management.
 *
 * Layer 1: Rough estimation (~4 chars per token)
 * Layer 2: API-based counting (provider-specific)
 * Layer 3: Context window management
 */

// ---------------------------------------------------------------------------
// Layer 1: Rough Estimation
// ---------------------------------------------------------------------------

export function roughTokenCount(content: string, bytesPerToken: number = 4): number {
  return Math.ceil(content.length / bytesPerToken)
}

export function roughJsonTokenCount(json: string): number {
  return Math.ceil(json.length / 2)
}

export const IMAGE_TOKEN_COUNT = 2000

export const TOOL_TOKEN_OVERHEAD = 500

export function estimateToolTokens(name: string, description: string, schema: string): number {
  return roughTokenCount(name + description + schema) + TOOL_TOKEN_OVERHEAD
}

// ---------------------------------------------------------------------------
// Layer 2: API-Based Counting (interface only)
// ---------------------------------------------------------------------------

export interface TokenCounter {
  readonly countMessages: (messages: ReadonlyArray<unknown>) => Promise<number>
}

export const nullTokenCounter: TokenCounter = {
  countMessages: async () => 0,
}

// ---------------------------------------------------------------------------
// Layer 3: Context Window Management
// ---------------------------------------------------------------------------

export const DEFAULT_CONTEXT_WINDOW = 200_000

export const EXTENDED_CONTEXT_WINDOW = 1_000_000

export const OUTPUT_BUFFER = 13_000

export const AUTOCOMPACT_BUFFER = 13_000

export const MIN_PRESERVE_RECENT_TOKENS = 2_000

export const MAX_PRESERVE_RECENT_TOKENS = 8_000

export function getEffectiveContextWindow(contextWindow: number): number {
  return Math.max(0, contextWindow - OUTPUT_BUFFER)
}

export function shouldAutoCompact(
  usedTokens: number,
  contextWindow: number,
): boolean {
  const effective = getEffectiveContextWindow(contextWindow)
  return usedTokens >= effective - AUTOCOMPACT_BUFFER
}

export function calculateTailBudget(usableTokens: number): number {
  return Math.min(
    MAX_PRESERVE_RECENT_TOKENS,
    Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usableTokens * 0.25)),
  )
}

export function calculateContextUsage(
  usedTokens: number,
  contextWindow: number,
): {
  readonly usedPercent: number
  readonly remainingTokens: number
  readonly remainingPercent: number
  readonly shouldWarn: boolean
  readonly shouldAutoCompact: boolean
  readonly shouldBlock: boolean
} {
  const effective = getEffectiveContextWindow(contextWindow)
  const usedPercent = Math.round((usedTokens / effective) * 100)
  const remainingTokens = Math.max(0, effective - usedTokens)
  const remainingPercent = Math.round((remainingTokens / effective) * 100)

  return {
    usedPercent,
    remainingTokens,
    remainingPercent,
    shouldWarn: usedPercent >= 70,
    shouldAutoCompact: shouldAutoCompact(usedTokens, contextWindow),
    shouldBlock: usedPercent >= 95,
  }
}
