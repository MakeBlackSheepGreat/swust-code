/**
 * Token Estimation - three-layer token counting for context management.
 *
 * Layer 1: Rough estimation (~4 chars per token)
 * Layer 2: API-based counting (provider-specific)
 * Layer 3: Fallback estimation (per-model heuristics)
 *
 * Ported from Claude-Code's tokenEstimation.ts and tokens.ts patterns.
 */

// ---------------------------------------------------------------------------
// Layer 1: Rough Estimation
// ---------------------------------------------------------------------------

/**
 * Rough token count estimation.
 * Default: ~4 characters per token for English text.
 * JSON files are denser: ~2 bytes per token.
 * Images: fixed 2000 tokens.
 */
export function roughTokenCount(content: string, bytesPerToken: number = 4): number {
  return Math.ceil(content.length / bytesPerToken)
}

/**
 * Estimate tokens for a JSON string (denser than prose).
 */
export function roughJsonTokenCount(json: string): number {
  return Math.ceil(json.length / 2)
}

/**
 * Fixed token count for images.
 */
export const IMAGE_TOKEN_COUNT = 2000

/**
 * Token count overhead per tool definition.
 */
export const TOOL_TOKEN_OVERHEAD = 500

/**
 * Estimate tokens for a tool definition (name + description + schema).
 */
export function estimateToolTokens(name: string, description: string, schema: string): number {
  return roughTokenCount(name + description + schema) + TOOL_TOKEN_OVERHEAD
}

// ---------------------------------------------------------------------------
// Layer 2: API-Based Counting (interface only)
// ---------------------------------------------------------------------------

/**
 * Interface for provider-specific token counting.
 * Implementations call the provider's token counting API.
 */
export interface TokenCounter {
  readonly countMessages: (messages: ReadonlyArray<unknown>) => Promise<number>
}

/**
 * No-op token counter that always returns 0.
 * Used when no provider-specific counter is available.
 */
export const nullTokenCounter: TokenCounter = {
  countMessages: async () => 0,
}

// ---------------------------------------------------------------------------
// Layer 3: Context Window Management
// ---------------------------------------------------------------------------

/** Default context window size */
export const DEFAULT_CONTEXT_WINDOW = 200_000

/** 1M context window (for models that support it) */
export const EXTENDED_CONTEXT_WINDOW = 1_000_000

/** Buffer tokens reserved for output */
export const OUTPUT_BUFFER = 13_000

/** Auto-compact trigger threshold */
export const AUTOCOMPACT_BUFFER = 13_000

/** Minimum tokens to preserve in tail after compaction */
export const MIN_PRESERVE_RECENT_TOKENS = 2_000

/** Maximum tokens to preserve in tail after compaction */
export const MAX_PRESERVE_RECENT_TOKENS = 8_000

/**
 * Get effective context window size (total - output buffer).
 */
export function getEffectiveContextWindow(contextWindow: number): number {
  return Math.max(0, contextWindow - OUTPUT_BUFFER)
}

/**
 * Check if context usage exceeds auto-compact threshold.
 */
export function shouldAutoCompact(
  usedTokens: number,
  contextWindow: number,
): boolean {
  const effective = getEffectiveContextWindow(contextWindow)
  return usedTokens >= effective - AUTOCOMPACT_BUFFER
}

/**
 * Calculate tail preservation budget.
 * The tail is the recent portion of conversation preserved verbatim.
 */
export function calculateTailBudget(usableTokens: number): number {
  return Math.min(
    MAX_PRESERVE_RECENT_TOKENS,
    Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usableTokens * 0.25)),
  )
}

/**
 * Calculate context usage percentages.
 */
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
