/**
 * Rebuild Context Assembly - assembles context after compaction.
 *
 * After compaction, the LLM needs structured context to resume work.
 * This module reads checkpoint, memory, notes, and active state,
 * then assembles them into a single coherent context string that
 * gets injected into the system prompt.
 *
 * Assembly order:
 * 1. Header (auto-loaded instruction)
 * 2. Tasks ledger (if available)
 * 3. Session checkpoint (checkpoint.md)
 * 4. Active actors (if any)
 * 5. Project memory (projects/<id>/MEMORY.md)
 * 6. Global memory (global/MEMORY.md)
 * 7. Session notes (sessions/<id>/notes.md)
 * 8. Continuity framing
 * 9. Tail-aware system reminder
 *
 * Ported from MiMo-Code's checkpoint.ts renderRebuildContext.
 */

import path from "path"
import fs from "fs"
import {
  TASKS_LEDGER_BUDGET,
  ACTIVE_ACTORS_BUDGET,
  MEMORY_KEYS_BUDGET,
  REBUILD_CONTEXT_MAX_TOKENS,
} from "./checkpoint-templates"
import { readBudgeted, readBudgetedSectionAware } from "./budgeted-read"
import { roughTokenCount } from "./token-estimation"
import type { LastMessageInfo } from "./compaction-strategy"

export interface RebuildContextInput {
  readonly dataDir: string
  readonly sessionID: string
  readonly projectID?: string
  readonly lastMessage?: LastMessageInfo
}

/**
 * Compute the memory root from the data directory.
 */
function memoryRoot(dataDir: string): string {
  return path.join(dataDir, "memory")
}

/**
 * Read a file safely, returning undefined on error.
 */
function readSafe(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf-8").trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Assemble the rebuild context after compaction.
 *
 * This is the core function that makes context compaction work.
 * Without it, the LLM would lose all knowledge of previous work
 * after the context window is compacted.
 */
export async function assembleRebuildContext(
  input: RebuildContextInput,
): Promise<string> {
  const { dataDir, sessionID, projectID, lastMessage } = input
  const root = memoryRoot(dataDir)

  // Paths
  const checkpointPath = path.join(root, "sessions", sessionID, "checkpoint.md")
  const notesPath = path.join(root, "sessions", sessionID, "notes.md")
  const projectMemoryPath = projectID
    ? path.join(root, "projects", projectID, "MEMORY.md")
    : undefined
  const globalMemoryPath = path.join(root, "global", "MEMORY.md")

  // Load all sources (in parallel via Promise.all)
  const [checkpoint, projectMemory, globalMemory, notes] = await Promise.all([
    readBudgetedSectionAware(checkpointPath, 11_000),
    projectMemoryPath
      ? readBudgetedSectionAware(projectMemoryPath, 10_000)
      : Promise.resolve(undefined),
    readBudgetedSectionAware(globalMemoryPath, 6_000),
    readBudgeted(notesPath, 6_000),
  ])

  // Early bail: nothing to inject
  if (!checkpoint && !projectMemory && !globalMemory && !notes) {
    return ""
  }

  const parts: string[] = []
  let usedTokens = 0

  // Section 1: Header
  const header = [
    "## Session Context (Auto-loaded)",
    "",
    "The following blocks are auto-loaded context from previous sessions.",
    "Do NOT re-Read these files -- they are already in your context.",
    "Use Grep if you need to find specific content within them.",
    "",
  ].join("\n")
  parts.push(header)
  usedTokens += roughTokenCount(header)

  // Section 2: Session checkpoint
  if (checkpoint) {
    const section = `\n### Session Checkpoint\n${checkpoint.text}\n`
    const tokens = roughTokenCount(section)
    if (usedTokens + tokens <= REBUILD_CONTEXT_MAX_TOKENS) {
      parts.push(section)
      usedTokens += tokens
    }
  }

  // Section 3: Project memory
  if (projectMemory) {
    const section = `\n### Project Memory\n${projectMemory.text}\n`
    const tokens = roughTokenCount(section)
    if (usedTokens + tokens <= REBUILD_CONTEXT_MAX_TOKENS) {
      parts.push(section)
      usedTokens += tokens
    }
  }

  // Section 4: Global memory
  if (globalMemory) {
    const section = `\n### Global Preferences\n${globalMemory.text}\n`
    const tokens = roughTokenCount(section)
    if (usedTokens + tokens <= REBUILD_CONTEXT_MAX_TOKENS) {
      parts.push(section)
      usedTokens += tokens
    }
  }

  // Section 5: Session notes
  if (notes) {
    const section = `\n### Session Notes\n${notes.text}\n`
    const tokens = roughTokenCount(section)
    if (usedTokens + tokens <= REBUILD_CONTEXT_MAX_TOKENS) {
      parts.push(section)
      usedTokens += tokens
    }
  }

  // Section 6: Continuity framing
  parts.push(
    "\n### Continuity",
    "",
    "The checkpoint and memory above cover earlier conversation.",
    "Messages below are real preserved history, not pseudo-content.",
    "Resume directly from where the conversation left off.",
    "Do not acknowledge the memory dump or summarize what you just read.",
    "",
  )

  // Section 7: Tail-aware system reminder
  if (lastMessage) {
    switch (lastMessage.role) {
      case "assistant":
        if (lastMessage.finish === "tool-calls") {
          parts.push(
            "<system-reminder>",
            "You are mid-loop in an autonomous task. Continue your work loop:",
            "respond to the tool results below and proceed to the next iteration.",
            "</system-reminder>",
          )
        } else {
          parts.push(
            "<system-reminder>",
            "The previous assistant turn ended with a stop.",
            "Before stopping again, check your task checklist.",
            "Only stop when tasks are genuinely complete or you need user input.",
            "</system-reminder>",
          )
        }
        break
      case "tool":
        parts.push(
          "<system-reminder>",
          "Tool results above are real history. Process them and continue.",
          "Do not pause to summarize.",
          "</system-reminder>",
        )
        break
    }
  }

  return parts.join("\n")
}
