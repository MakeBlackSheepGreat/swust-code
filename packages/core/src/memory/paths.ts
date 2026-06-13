import path from "path"
import fs from "fs/promises"
import { createHash } from "crypto"
import { Effect } from "effect"

export type MemoryKind = "global" | "project" | "session"

export interface MemoryLocator {
  readonly kind: MemoryKind
  readonly scopeId: string
  readonly relativePath: string
}

export function memoryRoot(data: string): string {
  return path.join(data, "memory")
}

export function globalDir(root: string): string {
  return path.join(root, "global")
}

export function projectsDir(root: string): string {
  return path.join(root, "projects")
}

export function sessionsDir(root: string): string {
  return path.join(root, "sessions")
}

export function memoryDirs(root: string): string[] {
  return [globalDir(root), projectsDir(root), sessionsDir(root)]
}

export function ensureDirs(root: string): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      await fs.mkdir(globalDir(root), { recursive: true })
      await fs.mkdir(projectsDir(root), { recursive: true })
      await fs.mkdir(sessionsDir(root), { recursive: true })
    },
    catch: () => undefined,
  }).pipe(Effect.orDie, Effect.catch(() => Effect.void))
}

export function parseMemoryPath(root: string, absPath: string): MemoryLocator | null {
  const normalized = absPath.replace(/\\/g, "/")
  const normalizedRoot = root.replace(/\\/g, "/")

  if (!normalized.startsWith(normalizedRoot + "/")) return null

  const relative = normalized.slice(normalizedRoot.length + 1)
  const parts = relative.split("/")

  if (parts.length < 2) return null

  const [scope, ...rest] = parts

  switch (scope) {
    case "global":
      return { kind: "global", scopeId: "", relativePath: rest.join("/") }
    case "projects": {
      if (rest.length < 2) return null
      const [projectId, ...fileParts] = rest
      return { kind: "project", scopeId: projectId, relativePath: fileParts.join("/") }
    }
    case "sessions": {
      if (rest.length < 2) return null
      const [sessionId, ...fileParts] = rest
      return { kind: "session", scopeId: sessionId, relativePath: fileParts.join("/") }
    }
    default:
      return null
  }
}

export function resolveProjectId(absRepoPath: string): string {
  return createHash("sha256").update(absRepoPath).digest("hex").slice(0, 12)
}
