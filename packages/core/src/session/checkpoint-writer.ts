/**
 * Checkpoint Writer Agent - writes session state to disk.
 *
 * At the end of each session (or when context compaction triggers),
 * the checkpoint writer agent:
 * 1. Summarizes the session into checkpoint.md (11 sections)
 * 2. Promotes durable knowledge to project MEMORY.md
 * 3. Reconciles session notes
 *
 * This agent runs as a subagent with restricted permissions:
 * - Only write/edit/memory/bash tools
 * - Only allowed to write to the session's memory directory
 *
 * Ported from MiMo-Code's checkpoint.ts patterns.
 */

import path from "path"
import fs from "fs/promises"
import {
  CHECKPOINT_TEMPLATE,
  MEMORY_TEMPLATE,
  NOTES_TEMPLATE,
  CHECKPOINT_SECTION_BUDGETS,
  MEMORY_SECTION_BUDGETS,
} from "./checkpoint-templates"

export interface CheckpointWriterInput {
  readonly dataDir: string
  readonly sessionID: string
  readonly projectID?: string
  readonly conversationSummary: string
  readonly tasksSummary?: string
  readonly discoveredKnowledge?: string
  readonly errors?: string
  readonly designDecisions?: string
}

/**
 * Get the checkpoint file path for a session.
 */
export function checkpointPath(dataDir: string, sessionID: string): string {
  return path.join(dataDir, "memory", "sessions", sessionID, "checkpoint.md")
}

/**
 * Get the notes file path for a session.
 */
export function notesPath(dataDir: string, sessionID: string): string {
  return path.join(dataDir, "memory", "sessions", sessionID, "notes.md")
}

/**
 * Get the project memory file path.
 */
export function projectMemoryPath(dataDir: string, projectID: string): string {
  return path.join(dataDir, "memory", "projects", projectID, "MEMORY.md")
}

/**
 * Get the global memory file path.
 */
export function globalMemoryPath(dataDir: string): string {
  return path.join(dataDir, "memory", "global", "MEMORY.md")
}

/**
 * Ensure a template file exists on disk. Creates it from the template if missing.
 */
async function ensureTemplate(filePath: string, template: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, template, "utf-8")
  }
}

/**
 * Write a checkpoint for the current session.
 *
 * This is the core function that the checkpoint writer agent calls.
 * It creates/updates checkpoint.md with structured session state.
 */
export async function writeCheckpoint(input: CheckpointWriterInput): Promise<void> {
  const { dataDir, sessionID, projectID, conversationSummary, tasksSummary, discoveredKnowledge, errors, designDecisions } = input

  // Ensure directories exist
  const checkpointFile = checkpointPath(dataDir, sessionID)
  await fs.mkdir(path.dirname(checkpointFile), { recursive: true })

  // Build checkpoint content
  const now = new Date().toISOString()
  const sections: string[] = [
    `# Session Checkpoint`,
    `<!-- Updated: ${now} -->`,
    ``,
    `## SS1 Active Intent`,
    conversationSummary.slice(0, CHECKPOINT_SECTION_BUDGETS["SS1 Active Intent"] * 4),
    ``,
    `## SS2 Next Concrete Action`,
    `<!-- Auto-filled by checkpoint writer -->`,
    ``,
    `## SS4 Task Tree`,
    tasksSummary || `No active tasks.`,
    ``,
    `## SS5 Current Work`,
    conversationSummary.slice(0, CHECKPOINT_SECTION_BUDGETS["SS5 Current Work"] * 4),
    ``,
    `## SS7 Discovered Knowledge`,
    discoveredKnowledge || `<!-- Nothing discovered this session -->`,
    ``,
    `## SS8 Errors and Fixes`,
    errors || `<!-- No errors encountered -->`,
    ``,
    `## SS10 Design Decisions`,
    designDecisions || `<!-- No design decisions this session -->`,
  ]

  await fs.writeFile(checkpointFile, sections.join("\n"), "utf-8")

  // Ensure project memory exists
  if (projectID) {
    const memoryFile = projectMemoryPath(dataDir, projectID)
    await ensureTemplate(memoryFile, MEMORY_TEMPLATE)
  }

  // Ensure global memory exists
  const globalFile = globalMemoryPath(dataDir)
  await ensureTemplate(globalFile, MEMORY_TEMPLATE)

  // Ensure notes file exists
  const notesFile = notesPath(dataDir, sessionID)
  await ensureTemplate(notesFile, NOTES_TEMPLATE)
}

/**
 * Promote knowledge from checkpoint to project memory.
 *
 * Called when Dream runs: reads checkpoint SS7 (discovered knowledge)
 * and merges it into MEMORY.md's "Discovered Durable Knowledge" section.
 */
export async function promoteToMemory(
  dataDir: string,
  projectID: string,
  knowledge: string,
): Promise<void> {
  const memoryFile = projectMemoryPath(dataDir, projectID)
  await ensureTemplate(memoryFile, MEMORY_TEMPLATE)

  const content = await fs.readFile(memoryFile, "utf-8")
  const marker = "## Discovered Durable Knowledge"

  if (content.includes(marker)) {
    // Append to existing section
    const idx = content.indexOf(marker)
    const afterMarker = content.slice(idx + marker.length)
    const nextSection = afterMarker.search(/\n## /)
    const insertPoint = nextSection >= 0 ? idx + marker.length + nextSection : content.length

    const before = content.slice(0, insertPoint)
    const after = content.slice(insertPoint)
    const entry = `\n- ${knowledge} (${new Date().toISOString().split("T")[0]})`

    await fs.writeFile(memoryFile, before + entry + after, "utf-8")
  } else {
    // Add the section
    await fs.writeFile(
      memoryFile,
      content + `\n\n${marker}\n- ${knowledge} (${new Date().toISOString().split("T")[0]})\n`,
      "utf-8",
    )
  }
}

/**
 * The checkpoint writer agent system prompt.
 */
export const CHECKPOINT_WRITER_PROMPT = `You are a checkpoint writer agent. Your job is to summarize the current session state into structured markdown files.

## Your Task
1. Read the conversation history
2. Extract key information for each checkpoint section
3. Write checkpoint.md with structured session state
4. Promote durable knowledge to MEMORY.md

## Checkpoint Sections
- SS1 Active Intent: What the user asked for
- SS2 Next Concrete Action: The single most important next step
- SS4 Task Tree: Current task status
- SS5 Current Work: What was being done
- SS7 Discovered Knowledge: Facts worth remembering
- SS8 Errors and Fixes: Error patterns and solutions
- SS10 Design Decisions: Decisions with rationale

## Rules
- Keep each section within its token budget
- Focus on facts, not narrative
- Use markdown formatting
- Include file paths and line references where relevant
- Promote only truly durable knowledge to MEMORY.md

## Output
Return a JSON object with:
- checkpoint: the checkpoint.md content
- memory_updates: any entries to add to MEMORY.md
- notes_updates: any entries to add to notes.md
`
