/**
 * FTS5 query builder for memory search.
 *
 * Tokenizes free-form queries with Unicode-aware regex, wraps each token
 * in phrase quotes to escape FTS5 special characters, and OR-joins them.
 * OR is chosen over AND because AND returned near-zero results for most
 * multi-word queries; BM25 ranking handles common-word noise via score floor.
 */

const TOKEN_RE = /[\p{L}\p{N}_]+/gu
const MIN_TOKEN_LENGTH = 2

export function tokenize(query: string): string[] {
  const tokens: string[] = []
  for (const match of query.matchAll(TOKEN_RE)) {
    const token = match[0].toLowerCase()
    if (token.length >= MIN_TOKEN_LENGTH) {
      tokens.push(token)
    }
  }
  return tokens
}

export function buildFtsQuery(raw: string): string | null {
  const tokens = tokenize(raw)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t}"`).join(" OR ")
}

export interface SearchResult {
  readonly path: string
  readonly kind: string
  readonly scopeId: string
  readonly title: string
  readonly snippet: string
  readonly score: number
}

/**
 * Apply relative score floor to filter noise.
 * BM25 returns negative scores (lower = better).
 * We negate to make positive (higher = better), then filter by floorRatio.
 */
export function applyScoreFloor(
  results: ReadonlyArray<SearchResult>,
  floorRatio: number,
  limit: number,
): ReadonlyArray<SearchResult> {
  if (results.length === 0) return results
  if (floorRatio <= 0) return results.slice(0, limit)

  const topScore = results[0].score
  const threshold = topScore * floorRatio

  const filtered: SearchResult[] = []
  for (const r of results) {
    if (r.score >= threshold || filtered.length === 0) {
      filtered.push(r)
    }
    if (filtered.length >= limit) break
  }
  return filtered
}
