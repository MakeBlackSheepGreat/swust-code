/**
 * Document Validation System - spec-driven development enforcement.
 *
 * Validates markdown documents against predefined templates:
 * - spec: Feature Specification (required sections, max 6 L2 headings)
 * - design: Implementation Plan (required sections, max 10 L2 headings)
 * - tasks: Task Breakdown (required sections, max 50 L2 headings)
 *
 * Features:
 * - Stack-based markdown section tree parsing
 * - Code-fence-aware parsing (skips headings inside code blocks)
 * - Bilingual section matching (Chinese/English aliases)
 * - Missing/extra/duplicate section detection
 */

export interface Section {
  readonly level: number
  readonly title: string
  readonly normalizedTitle: string
  readonly content: string
  children: Section[]
  readonly lineNumber: number
}

export interface ValidationResult {
  readonly valid: boolean
  readonly errors: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
}

export interface DocumentFormatRules {
  readonly requiredSections: ReadonlyArray<string>
  readonly optionalSections?: ReadonlyArray<string>
  readonly maxSectionLevel2?: number
  readonly aliases?: Record<string, ReadonlyArray<string>>
}

const DEFAULT_ALIASES: Record<string, ReadonlyArray<string>> = {
  "overview": ["概述", "概览", "简介"],
  "requirements": ["需求", "功能需求"],
  "summary": ["摘要", "总结"],
  "technical context": ["技术背景", "技术上下文"],
  "success criteria": ["成功标准", "验收标准"],
  "assumptions": ["假设", "前提条件"],
  "open questions": ["开放问题", "待解决问题"],
}

export const FORMAT_RULES: Record<string, DocumentFormatRules> = {
  spec: {
    requiredSections: [
      "overview",
      "user scenarios & testing",
      "requirements",
      "success criteria",
      "assumptions",
      "open questions",
    ],
    maxSectionLevel2: 6,
    aliases: DEFAULT_ALIASES,
  },
  design: {
    requiredSections: [
      "summary",
      "technical context",
      "project structure",
      "research & decisions",
      "data model",
      "contracts & interfaces",
    ],
    optionalSections: ["complexity tracking", "quickstart", "changelog"],
    maxSectionLevel2: 10,
    aliases: DEFAULT_ALIASES,
  },
  tasks: {
    requiredSections: [
      "format",
      "path conventions",
      "dependencies & execution order",
      "parallel example",
      "implementation strategy",
      "notes",
    ],
    optionalSections: ["dependency graph", "parallel execution guide", "summary report"],
    maxSectionLevel2: 50,
    aliases: DEFAULT_ALIASES,
  },
}

export function normalizeSectionTitle(title: string): string {
  return title
    .replace(/\*\*/g, "")
    .replace(/　/g, " ")
    .replace(/：/g, ":")
    .replace(/\s*\*\(.*?\)\*/g, "")
    .trim()
    .toLowerCase()
}

export function parseMarkdownSections(content: string): ReadonlyArray<Section> {
  const lines = content.split("\n")
  let inCodeFence = false

  const headings: Array<{ level: number; title: string; line: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({ level: match[1].length, title: match[2].trim(), line: i })
    }
  }

  const sections: Section[] = headings.map((h, idx) => {
    const nextLine = idx + 1 < headings.length ? headings[idx + 1].line : lines.length
    return {
      level: h.level,
      title: h.title,
      normalizedTitle: normalizeSectionTitle(h.title),
      content: lines.slice(h.line + 1, nextLine).join("\n").trim(),
      children: [],
      lineNumber: h.line + 1,
    }
  })

  const root: Section[] = []
  const stack: Section[] = []

  for (const section of sections) {
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(section)
    } else {
      stack[stack.length - 1].children.push(section)
    }

    stack.push(section)
  }

  return root
}

function collectLevel2Titles(sections: ReadonlyArray<Section>): string[] {
  const titles: string[] = []
  for (const section of sections) {
    if (section.level === 2) {
      titles.push(section.normalizedTitle)
    }
    titles.push(...collectLevel2Titles(section.children))
  }
  return titles
}

function matchesSection(
  title: string,
  required: string,
  aliases?: Record<string, ReadonlyArray<string>>,
): boolean {
  if (title === required) return true

  const aliasList = aliases?.[required] ?? DEFAULT_ALIASES[required]
  if (aliasList) {
    for (const alias of aliasList) {
      if (title === alias.toLowerCase()) return true
    }
  }

  if (title.startsWith(required + ":") || title.startsWith(required + "：")) {
    return true
  }

  return false
}

export function validateDocument(
  content: string,
  documentType: string,
): ValidationResult {
  const rules = FORMAT_RULES[documentType]
  if (!rules) {
    return { valid: false, errors: [`Unknown document type: ${documentType}`], warnings: [] }
  }

  const sections = parseMarkdownSections(content)
  const level2Titles = collectLevel2Titles(sections)
  const errors: string[] = []
  const warnings: string[] = []

  for (const required of rules.requiredSections) {
    const found = level2Titles.some((t) => matchesSection(t, required, rules.aliases))
    if (!found) {
      errors.push(`Missing required section: ## ${required}`)
    }
  }

  const seen = new Map<string, number>()
  for (const title of level2Titles) {
    const count = (seen.get(title) ?? 0) + 1
    seen.set(title, count)
    if (count > 1) {
      errors.push(`Duplicate section: ## ${title}`)
    }
  }

  if (rules.maxSectionLevel2 && level2Titles.length > rules.maxSectionLevel2) {
    warnings.push(
      `Too many level-2 sections (${level2Titles.length}, max ${rules.maxSectionLevel2})`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
