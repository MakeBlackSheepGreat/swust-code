/**
 * Memory Initializer - creates memory directory structure and templates.
 *
 * Called on first run or when setting up a new project.
 * Creates the full directory tree and populates template files
 * so the memory system has a well-formed starting state.
 *
 * Directory structure:
 *   <data>/memory/
 *     global/MEMORY.md
 *     projects/<projectID>/MEMORY.md
 *     sessions/<sessionID>/checkpoint.md
 *     sessions/<sessionID>/notes.md
 */

import path from "path"
import fs from "fs/promises"
import { Effect } from "effect"
import { Global } from "../global"
import {
  MEMORY_TEMPLATE,
  CHECKPOINT_TEMPLATE,
  NOTES_TEMPLATE,
} from "../session/checkpoint-templates"

/**
 * Ensure a file exists, creating it from a template if missing.
 */
async function ensureFile(filePath: string, template: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return false // already exists
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, template, "utf-8")
    return true // created
  }
}

/**
 * Initialize the global memory directory.
 */
export async function initializeGlobalMemory(dataDir: string): Promise<boolean> {
  const memoryFile = path.join(dataDir, "memory", "global", "MEMORY.md")
  return ensureFile(memoryFile, MEMORY_TEMPLATE)
}

/**
 * Initialize project memory directory.
 */
export async function initializeProjectMemory(
  dataDir: string,
  projectID: string,
): Promise<boolean> {
  const memoryFile = path.join(dataDir, "memory", "projects", projectID, "MEMORY.md")
  return ensureFile(memoryFile, MEMORY_TEMPLATE)
}

/**
 * Initialize session memory directory.
 */
export async function initializeSessionMemory(
  dataDir: string,
  sessionID: string,
): Promise<{ checkpointCreated: boolean; notesCreated: boolean }> {
  const checkpointFile = path.join(dataDir, "memory", "sessions", sessionID, "checkpoint.md")
  const notesFile = path.join(dataDir, "memory", "sessions", sessionID, "notes.md")

  const checkpointCreated = await ensureFile(checkpointFile, CHECKPOINT_TEMPLATE)
  const notesCreated = await ensureFile(notesFile, NOTES_TEMPLATE)

  return { checkpointCreated, notesCreated }
}

/**
 * Full initialization: create all directories and templates.
 * Called on first run.
 */
export async function initializeMemorySystem(dataDir: string): Promise<{
  globalCreated: boolean
  dirsCreated: boolean
}> {
  const root = path.join(dataDir, "memory")

  // Create directory structure
  const dirs = [
    path.join(root, "global"),
    path.join(root, "projects"),
    path.join(root, "sessions"),
  ]

  let dirsCreated = false
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true })
      dirsCreated = true
    } catch {
      // Already exists
    }
  }

  // Create global memory template
  const globalCreated = await initializeGlobalMemory(dataDir)

  return { globalCreated, dirsCreated }
}

/**
 * Discover existing project IDs from the memory directory.
 */
export async function discoverProjects(dataDir: string): Promise<ReadonlyArray<string>> {
  const projectsDir = path.join(dataDir, "memory", "projects")
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Discover existing session IDs from the memory directory.
 */
export async function discoverSessions(dataDir: string): Promise<ReadonlyArray<string>> {
  const sessionsDir = path.join(dataDir, "memory", "sessions")
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Get memory system health metrics.
 */
export async function getMemoryHealth(dataDir: string): Promise<{
  globalExists: boolean
  projectCount: number
  sessionCount: number
  totalSizeBytes: number
}> {
  const root = path.join(dataDir, "memory")

  let globalExists = false
  try {
    await fs.access(path.join(root, "global", "MEMORY.md"))
    globalExists = true
  } catch {
    // doesn't exist
  }

  const projects = await discoverProjects(dataDir)
  const sessions = await discoverSessions(dataDir)

  // Calculate total size (sample-based for performance)
  let totalSize = 0
  try {
    const walk = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isFile()) {
            const stat = await fs.stat(fullPath)
            totalSize += stat.size
          } else if (entry.isDirectory()) {
            await walk(fullPath)
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
    await walk(root)
  } catch {
    // ignore
  }

  return {
    globalExists,
    projectCount: projects.length,
    sessionCount: sessions.length,
    totalSizeBytes: totalSize,
  }
}
