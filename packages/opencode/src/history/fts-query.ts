export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? []
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" AND ")
}
