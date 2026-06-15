import path from "path"
import fs from "fs/promises"
import { Global } from "@swust-code/core/global"
import type { ID as ProjectID } from "@swust-code/core/project"
import type { SessionID } from "./schema"

export function metaDir(sessionID: SessionID): string {
  return path.join(Global.Path.data, "memory", "sessions", sessionID)
}

export function checkpointPath(sessionID: SessionID): string {
  return path.join(metaDir(sessionID), "checkpoint.md")
}

export function memoryPath(projectID: ProjectID): string {
  return path.join(Global.Path.data, "memory", "projects", projectID, "MEMORY.md")
}

export function globalMemoryPath(): string {
  return path.join(Global.Path.data, "memory", "global", "MEMORY.md")
}

export async function migrateProjectMemory(projectID: ProjectID): Promise<void> {
  const upper = memoryPath(projectID)
  const lower = path.join(path.dirname(upper), "memory.md")
  if (await Bun.file(upper).exists()) return
  if (await Bun.file(lower).exists()) {
    await fs.rename(lower, upper).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }
}

export function notesPath(sessionID: SessionID): string {
  return path.join(metaDir(sessionID), "notes.md")
}

export function tasksDir(sessionID: SessionID): string {
  return path.join(metaDir(sessionID), "tasks")
}

export function progressPath(sessionID: SessionID, taskID: string): string {
  return path.join(tasksDir(sessionID), taskID, "progress.md")
}
