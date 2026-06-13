/**
 * Fact Store - one-fact-per-file memory storage.
 *
 * Each fact is stored as a separate markdown file with YAML frontmatter.
 * A MEMORY.md index provides a one-line-per-fact summary for fast scanning.
 *
 * Complementary to the FTS5 search system:
 * - Fact Store: human-readable, git-friendly, easy to edit manually
 * - FTS5: machine-searchable, BM25-ranked, fast full-text retrieval
 *
 * File structure:
 *   <data>/memory/projects/<id>/
 *     facts/
 *       auth-decision.md      (frontmatter + body)
 *       api-rate-limits.md
 *       ...
 *     MEMORY.md               (index: one line per fact)
 *
 * Ported from DeepSeek-Reasonix's memory/store.go.
 */

import path from "path"
import fs from "fs/promises"
import { Effect } from "effect"

export type FactType = "user" | "feedback" | "project" | "reference"

export interface MemoryFact {
  readonly name: string         // kebab-case slug; also the filename stem
  readonly title: string        // human-readable label
  readonly description: string  // one-line summary for the index
  readonly type: FactType
  readonly body: string         // the fact itself (markdown)
}

const VALID_TYPES = new Set<FactType>(["user", "feedback", "project", "reference"])

export function normalizeType(s: string): FactType {
  const lower = s.toLowerCase().trim() as FactType
  return VALID_TYPES.has(lower) ? lower : "project"
}

/**
 * Get the facts directory for a project.
 */
export function factsDir(dataDir: string, projectId: string): string {
  return path.join(dataDir, "memory", "projects", projectId, "facts")
}

/**
 * Get the MEMORY.md index path for a project.
 */
export function memoryIndexPath(dataDir: string, projectId: string): string {
  return path.join(dataDir, "memory", "projects", projectId, "MEMORY.md")
}

/**
 * Parse frontmatter from a markdown file.
 */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "")
    meta[key] = value
  }
  return { meta, body: match[2].trim() }
}

/**
 * Load all facts from the facts directory.
 */
export async function loadFacts(dataDir: string, projectId: string): Promise<MemoryFact[]> {
  const dir = factsDir(dataDir, projectId)
  try {
    const entries = await fs.readdir(dir)
    const facts: MemoryFact[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      const content = await fs.readFile(path.join(dir, entry), "utf-8")
      const { meta, body } = parseFrontmatter(content)
      const name = entry.replace(/\.md$/, "")
      facts.push({
        name,
        title: meta.title || name.replace(/-/g, " "),
        description: meta.description || body.split("\n")[0]?.slice(0, 100) || "",
        type: normalizeType(meta.type || "project"),
        body,
      })
    }
    return facts
  } catch {
    return []
  }
}

/**
 * Save a fact to disk and update the index.
 */
export async function saveFact(dataDir: string, projectId: string, fact: MemoryFact): Promise<void> {
  const dir = factsDir(dataDir, projectId)
  await fs.mkdir(dir, { recursive: true })

  const content = [
    "---",
    `title: "${fact.title}"`,
    `description: "${fact.description}"`,
    `type: ${fact.type}`,
    "---",
    "",
    fact.body,
  ].join("\n")

  await fs.writeFile(path.join(dir, `${fact.name}.md`), content, "utf-8")
  await rebuildIndex(dataDir, projectId)
}

/**
 * Delete a fact and update the index.
 */
export async function deleteFact(dataDir: string, projectId: string, name: string): Promise<boolean> {
  const filePath = path.join(factsDir(dataDir, projectId), `${name}.md`)
  try {
    await fs.unlink(filePath)
    await rebuildIndex(dataDir, projectId)
    return true
  } catch {
    return false
  }
}

/**
 * Rebuild the MEMORY.md index from all facts.
 */
async function rebuildIndex(dataDir: string, projectId: string): Promise<void> {
  const facts = await loadFacts(dataDir, projectId)
  const lines = ["# Memory Index", ""]
  for (const fact of facts.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`- **${fact.title}** [${fact.type}]: ${fact.description} (${fact.name}.md)`)
  }
  await fs.writeFile(memoryIndexPath(dataDir, projectId), lines.join("\n"), "utf-8")
}
