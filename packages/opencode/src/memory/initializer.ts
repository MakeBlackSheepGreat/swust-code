/**
 * Memory Initializer - creates memory directory structure and templates.
 *
 * Called on first run or when setting up a new project.
 * Creates the full directory tree and populates template files
 * so the memory system has a well-formed starting state.
 */

import path from "path"
import fs from "fs/promises"

const MEMORY_TEMPLATE = `# Project Memory

## Rules

## Architecture decisions

## Discovered durable knowledge
`

const CHECKPOINT_TEMPLATE = `# Session Checkpoint

## Active Intent

## Next Action

## Directives

## Task Tree

## Current Work

## Files

## Learnings

## Errors

## Live Resources

## Design Decisions

## Open Notes
`

const NOTES_TEMPLATE = `# Session Notes

`

async function ensureFile(filePath: string, template: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return false
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, template, "utf-8")
    return true
  }
}

export async function initializeGlobalMemory(dataDir: string): Promise<boolean> {
  const memoryFile = path.join(dataDir, "memory", "global", "MEMORY.md")
  return ensureFile(memoryFile, MEMORY_TEMPLATE)
}

export async function initializeProjectMemory(
  dataDir: string,
  projectID: string,
): Promise<boolean> {
  const memoryFile = path.join(dataDir, "memory", "projects", projectID, "MEMORY.md")
  return ensureFile(memoryFile, MEMORY_TEMPLATE)
}

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

export async function initializeMemorySystem(dataDir: string): Promise<{
  globalCreated: boolean
  dirsCreated: boolean
}> {
  const root = path.join(dataDir, "memory")

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

  const globalCreated = await initializeGlobalMemory(dataDir)

  return { globalCreated, dirsCreated }
}

export async function discoverProjects(dataDir: string): Promise<ReadonlyArray<string>> {
  const projectsDir = path.join(dataDir, "memory", "projects")
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function discoverSessions(dataDir: string): Promise<ReadonlyArray<string>> {
  const sessionsDir = path.join(dataDir, "memory", "sessions")
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

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
