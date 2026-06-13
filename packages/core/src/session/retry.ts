/**
 * Session Retry - header-aware retry with exponential backoff.
 *
 * Respects provider retry-after hints (retry-after-ms, retry-after headers),
 * falls back to exponential backoff when headers are absent.
 *
 * Ported from MiMo-Code's session/retry.ts.
 */

// Constants
export const RETRY_INITIAL_DELAY = 2000 // 2 seconds
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed int for setTimeout

// HTTP status codes that indicate transient failures
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529])

// Network error codes that indicate transient failures
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
])

// Plain-text patterns that indicate rate limiting
const RATE_LIMIT_PATTERNS = [
  "rate increased too quickly",
  "rate limit",
  "too many requests",
  "capacity",
  "overloaded",
]

// JSON-embedded error body patterns
const RATE_LIMIT_JSON_CODES = [
  "too_many_requests",
  "exhausted",
  "unavailable",
  "rate_limit",
]

export interface RetryableError {
  readonly status?: number
  readonly code?: string
  readonly message?: string
  readonly headers?: Record<string, string>
  readonly isRetryable?: boolean
  readonly isContextOverflow?: boolean
}

/**
 * Check if an error is a transient/retryable error.
 * Single source of truth for retry decisions.
 */
export function isRetryableTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const e = error as Record<string, unknown>

  // Context overflow errors are never retried
  if (e.isContextOverflow === true) return false

  // Check explicit retryable flag
  if (e.isRetryable === true) return true

  // Check HTTP status codes
  const status = e.status as number | undefined
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true

  // Check network error codes
  const code = e.code as string | undefined
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true

  // Check message patterns
  const message = (e.message as string)?.toLowerCase() ?? ""
  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (message.includes(pattern)) return true
  }

  // Check JSON error bodies
  try {
    const body = typeof e.body === "string" ? JSON.parse(e.body) : e.body
    if (body?.error?.code && RATE_LIMIT_JSON_CODES.includes(body.error.code)) return true
  } catch {
    // Not JSON, ignore
  }

  return false
}

/**
 * Calculate retry delay from response headers or exponential backoff.
 * Respects retry-after-ms and retry-after headers.
 */
export function calculateDelay(
  attempt: number,
  headers?: Record<string, string>,
): number {
  if (headers) {
    // Try retry-after-ms first (milliseconds)
    const retryAfterMs = headers["retry-after-ms"]
    if (retryAfterMs) {
      const ms = parseInt(retryAfterMs, 10)
      if (!isNaN(ms) && ms > 0) return Math.min(ms, RETRY_MAX_DELAY)
    }

    // Try retry-after (seconds or HTTP date)
    const retryAfter = headers["retry-after"]
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10)
      if (!isNaN(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, RETRY_MAX_DELAY)
      }
      // Try HTTP date format
      const date = new Date(retryAfter)
      if (!isNaN(date.getTime())) {
        const delay = date.getTime() - Date.now()
        if (delay > 0) return Math.min(delay, RETRY_MAX_DELAY)
      }
    }
  }

  // Exponential backoff
  const delay = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt)
  return Math.min(delay, RETRY_MAX_DELAY_NO_HEADERS)
}

/**
 * Format delay as human-readable string.
 */
export function formatDelay(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}
