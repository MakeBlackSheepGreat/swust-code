/**
 * Permission Decision Pipeline - layered security for tool execution.
 *
 * Implements a deny > ask > tool-check > mode pipeline inspired by
 * Claude-Code's 4-step permission system.
 *
 * Decision flow:
 *   1. Blanket deny rules → immediate deny
 *   2. Blanket ask rules → prompt user
 *   3. Tool-specific checkPermissions → tool decides
 *   4. Mode-based override (bypass/acceptEdits/dontAsk/auto)
 *   5. Default → ask (fail-safe)
 */

export type PermissionDecision = "allow" | "ask" | "deny"
export type PermissionMode = "default" | "bypass" | "acceptEdits" | "dontAsk" | "auto"

export interface PermissionRule {
  readonly tool: string
  readonly pattern?: string
  readonly decision: "allow" | "deny" | "ask"
  readonly source: "user" | "project" | "policy"
}

export interface PermissionContext {
  readonly toolName: string
  readonly input: unknown
  readonly mode: PermissionMode
  readonly rules: ReadonlyArray<PermissionRule>
  readonly isReadOnly: boolean
  readonly isDestructive: boolean
  readonly isBashCommand?: string
}

export interface PermissionResult {
  readonly decision: PermissionDecision
  readonly reason: string
  readonly matchedRule?: PermissionRule
}

/**
 * Evaluate permission for a tool invocation.
 * Follows the deny > ask > tool-check > mode pipeline.
 */
export function evaluatePermission(ctx: PermissionContext): PermissionResult {
  // Step 1: Blanket deny rules (highest priority)
  const denyRule = ctx.rules.find(
    (r) => r.tool === ctx.toolName && r.decision === "deny" && !r.pattern,
  )
  if (denyRule) {
    return { decision: "deny", reason: `Blanket deny rule matched`, matchedRule: denyRule }
  }

  // Step 2: Bash-specific safety check
  if (ctx.isBashCommand) {
    const bashResult = evaluateBashSafety(ctx.isBashCommand)
    if (bashResult.decision === "deny") {
      return bashResult
    }
  }

  // Step 3: Blanket ask rules
  const askRule = ctx.rules.find(
    (r) => r.tool === ctx.toolName && r.decision === "ask" && !r.pattern,
  )
  if (askRule) {
    // In bypass mode, skip ask rules (unless it's a safety check)
    if (ctx.mode === "bypass" && !ctx.isDestructive) {
      return { decision: "allow", reason: "Bypass mode overrides ask rule" }
    }
    return { decision: "ask", reason: "Blanket ask rule matched", matchedRule: askRule }
  }

  // Step 4: Content-specific rules
  const contentRule = ctx.rules.find(
    (r) => r.tool === ctx.toolName && r.pattern,
  )
  if (contentRule) {
    return {
      decision: contentRule.decision,
      reason: `Content rule matched: ${contentRule.pattern}`,
      matchedRule: contentRule,
    }
  }

  // Step 5: Mode-based decisions
  switch (ctx.mode) {
    case "bypass":
      return { decision: "allow", reason: "Bypass mode" }
    case "acceptEdits":
      if (ctx.isReadOnly) {
        return { decision: "allow", reason: "Read-only tool in acceptEdits mode" }
      }
      return { decision: "ask", reason: "Write tool in acceptEdits mode" }
    case "dontAsk":
      return { decision: "deny", reason: "dontAsk mode denies unknown tools" }
    case "auto":
      // In auto mode, delegate to classifier (not implemented here)
      return { decision: "ask", reason: "Auto mode - needs classifier" }
    case "default":
    default:
      // Step 6: Default - ask for destructive, allow for read-only
      if (ctx.isReadOnly) {
        return { decision: "allow", reason: "Read-only tool, default allow" }
      }
      return { decision: "ask", reason: "Write tool requires confirmation" }
  }
}

/**
 * Bash-specific safety evaluation.
 * Returns deny for clearly dangerous commands.
 */
function evaluateBashSafety(command: string): PermissionResult {
  const DANGEROUS = [
    { pattern: /\brm\s+(-[rRf]+\s+)?\//, reason: "Recursive deletion from root" },
    { pattern: />\s*\/(etc|usr|bin)\//, reason: "Write to system directory" },
    { pattern: /\|\s*(ba)?sh\b/, reason: "Pipe to shell interpreter" },
    { pattern: /\beval\s+/, reason: "Dynamic code evaluation" },
    { pattern: /\bchmod\s+777/, reason: "World-writable permissions" },
    { pattern: /\bcurl.*\|\s*(ba)?sh/, reason: "Download and execute" },
    { pattern: /\bmkfs\b/, reason: "Filesystem formatting" },
    { pattern: /\b:\(\)\s*\{/, reason: "Fork bomb" },
    { pattern: /\bkill\s+-9\s+-1/, reason: "Kill all processes" },
  ]

  for (const { pattern, reason } of DANGEROUS) {
    if (pattern.test(command)) {
      return { decision: "deny", reason: `Dangerous command: ${reason}` }
    }
  }

  return { decision: "allow", reason: "Bash command passed safety check" }
}

/**
 * Generate permission suggestions for a tool invocation.
 * Used in the interactive permission dialog.
 */
export function generateSuggestions(ctx: PermissionContext): ReadonlyArray<{
  readonly label: string
  readonly rule: PermissionRule
}> {
  const suggestions: Array<{ label: string; rule: PermissionRule }> = []

  if (ctx.isBashCommand) {
    // Extract command prefix for suggestion
    const prefix = ctx.isBashCommand.trim().split(/\s+/).slice(0, 2).join(" ")
    if (prefix) {
      suggestions.push({
        label: `Allow all "${prefix}" commands`,
        rule: { tool: "bash", pattern: `${prefix}*`, decision: "allow", source: "user" },
      })
    }
  }

  suggestions.push({
    label: `Always allow "${ctx.toolName}"`,
    rule: { tool: ctx.toolName, decision: "allow", source: "user" },
  })

  return suggestions
}
