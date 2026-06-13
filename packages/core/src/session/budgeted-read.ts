/**
 * Budgeted Read - token-aware file reading with truncation.
 *
 * Two modes:
 * - readBudgeted: Simple truncation at token budget
 * - readBudgetedSectionAware: Preserves section headers, truncates bodies
 *
 * Ported from MiMo-Code's budgeted-read.ts.
 */

import fs from "fs/promises"

export interface BudgetedReadResult {
  readonly text: string
  readonly truncated: boolean
  readonly totalTokens: number
}

/**
 * Rough token estimation: ~4 characters per token for English text.
 * This is intentionally simple -- exact counting is not needed for budgeting.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Read a file with a token budget. Truncates if over budget.
 * Truncation happens at newline boundaries to avoid mid-line breaks.
 * Appends a truncation hint with offset for continued reading.
 */
export async function readBudgeted(
  filePath: string,
  budgetTokens: number,
): Promise<BudgetedReadResult | undefined> {
  try {
    const fullText = await fs.readFile(filePath, "utf-8")
    if (!fullText.trim()) return undefined

    const totalTokens = estimateTokens(fullText)
    if (totalTokens <= budgetTokens) {
      return { text: fullText, truncated: false, totalTokens }
    }

    // Truncate with 5% safety margin
    const ratio = budgetTokens / totalTokens
    const targetChars = Math.floor(fullText.length * ratio * 0.95)

    // Find last newline before target to avoid mid-line breaks
    let cutAt = fullText.lastIndexOf("\n", targetChars)
    if (cutAt <= 0) cutAt = targetChars

    const truncatedText = fullText.slice(0, cutAt)
    const hint = `\n\n... [truncated at ${estimateTokens(truncatedText)} tokens, ${totalTokens} total. Use Read with offset=${cutAt} to continue]`

    return {
      text: truncatedText + hint,
      truncated: true,
      totalTokens,
    }
  } catch {
    return undefined
  }
}

interface Section {
  header: string
  italic: string
  bodyLines: string[]
  indexLines: string[]
}

/**
 * Parse a structured document (checkpoint.md, MEMORY.md) into sections.
 * Each section has a ## heading, optional italic description, body, and index lines.
 */
function parseSections(content: string): { preamble: string; sections: Section[] } {
  const lines = content.split("\n")
  const sections: Section[] = []
  let preamble = ""
  let current: Section | null = null
  let inPreamble = true

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current)
      current = { header: line, italic: "", bodyLines: [], indexLines: [] }
      inPreamble = false
      continue
    }

    if (inPreamble) {
      preamble += line + "\n"
      continue
    }

    if (!current) continue

    if (line.startsWith("*") && line.endsWith("*") && !current.bodyLines.length) {
      current.italic = line
    } else if (line.match(/^- See .+\.\.\./)) {
      current.indexLines.push(line)
    } else {
      current.bodyLines.push(line)
    }
  }

  if (current) sections.push(current)
  return { preamble, sections }
}

/**
 * Read a file with section-aware truncation.
 * Preserves all section headers and italic descriptions.
 * Bodies are proportionally truncated within remaining budget.
 */
export async function readBudgetedSectionAware(
  filePath: string,
  budgetTokens: number,
): Promise<BudgetedReadResult | undefined> {
  try {
    const fullText = await fs.readFile(filePath, "utf-8")
    if (!fullText.trim()) return undefined

    const totalTokens = estimateTokens(fullText)
    if (totalTokens <= budgetTokens) {
      return { text: fullText, truncated: false, totalTokens }
    }

    const { preamble, sections } = parseSections(fullText)

    // Calculate header-only tokens (always included)
    let headerTokens = estimateTokens(preamble)
    for (const s of sections) {
      headerTokens += estimateTokens(s.header + "\n" + s.italic + "\n")
      for (const idx of s.indexLines) {
        headerTokens += estimateTokens(idx + "\n")
      }
    }

    if (headerTokens >= budgetTokens) {
      // Even headers exceed budget - return skeleton
      const skeleton = preamble + sections
        .map((s) => s.header + "\n" + (s.italic ? s.italic + "\n" : "") + s.indexLines.join("\n"))
        .join("\n")
      return { text: skeleton, truncated: true, totalTokens }
    }

    // Iteratively add section bodies within remaining budget
    let remaining = budgetTokens - headerTokens
    const result: string[] = [preamble.trimEnd()]
    let truncated = false

    for (const section of sections) {
      result.push("")
      result.push(section.header)
      if (section.italic) result.push(section.italic)

      const bodyText = section.bodyLines.join("\n").trim()
      if (!bodyText) {
        for (const idx of section.indexLines) result.push(idx)
        continue
      }

      const bodyTokens = estimateTokens(bodyText)
      if (bodyTokens <= remaining) {
        result.push(bodyText)
        remaining -= bodyTokens
      } else {
        // Proportionally truncate body
        const ratio = remaining / bodyTokens
        const targetChars = Math.floor(bodyText.length * ratio * 0.95)
        let cutAt = bodyText.lastIndexOf("\n", targetChars)
        if (cutAt <= 0) cutAt = targetChars
        result.push(bodyText.slice(0, cutAt))
        result.push(`\n... [section truncated]`)
        remaining = 0
        truncated = true
      }

      for (const idx of section.indexLines) result.push(idx)
    }

    const text = result.join("\n")
    return { text, truncated, totalTokens }
  } catch {
    return undefined
  }
}
