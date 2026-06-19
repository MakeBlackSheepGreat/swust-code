import path from "path"

const VALID_SCOPES = ["global", "projects", "sessions"] as const

/**
 * Validates that a memory write target path is allowed for the given agent.
 * Pure function - does not touch the filesystem.
 *
 * Two-tier policy:
 *   - Main agent: can write to any valid scope, except sessions/<sid>/tasks/*
 *   - Subagents: can only write under their own task directory
 */
export function assertMemoryWriteAllowed(input: {
  readonly target: string
  readonly memoryRoot: string
  readonly agentType?: "main" | "subagent"
  readonly taskId?: string
}): void {
  const { target, memoryRoot, agentType = "main", taskId } = input
  const normalizedRoot = memoryRoot.replace(/\\/g, "/").replace(/\/$/, "") + "/"
  const normalizedTarget = target.replace(/\\/g, "/")

  if (!normalizedTarget.startsWith(normalizedRoot)) return

  const rel = normalizedTarget.slice(normalizedRoot.length)
  const parts = rel.split("/")

  if (parts.length < 2) {
    throw new Error(
      `Memory writes require <scope>/<scope_id>/<key>.md format. You attempted: ${target}\n` +
        `Canonical paths:\n` +
        `  ${memoryRoot}/projects/<project_id>/MEMORY.md\n` +
        `  ${memoryRoot}/sessions/<session_id>/notes.md`,
    )
  }

  const scope = parts[0]
  if (!VALID_SCOPES.includes(scope as (typeof VALID_SCOPES)[number])) {
    throw new Error(
      `Invalid memory scope '${scope}'. Must be one of: global, projects, sessions.\n` +
        `You attempted: ${target}`,
    )
  }

  if (scope === "sessions" && parts.length >= 3 && parts[2] === "tasks") {
    if (agentType === "subagent" && taskId && parts[3] === taskId) {
      return
    }
    throw new Error(
      `Path '${rel}' is reserved for task-specific subagents.\n` +
        `Main agent writes to:\n` +
        `  sessions/<sid>/checkpoint.md\n` +
        `  sessions/<sid>/notes.md\n` +
        `  projects/<pid>/MEMORY.md`,
    )
  }
}

export function buildMemoryPath(
  root: string,
  scope: "global" | "projects" | "sessions",
  scopeId: string,
  key: string,
): string {
  const safeScopeId = scopeId.replace(/\.\./g, "").replace(/^\//, "")
  const safeKey = key.replace(/\.\./g, "").replace(/^\//, "")
  return path.join(root, scope, safeScopeId, safeKey)
}
