/**
 * Cache-Stable Prefix Architecture
 *
 * The system prompt is split into two parts:
 *
 * 1. PREFIX (byte-stable across turns):
 *    - Agent system prompt
 *    - Tool definitions
 *    - Hierarchical doc memory (AGENTS.md)
 *    - Auto-memory index (MEMORY.md one-liner per fact)
 *    - Skill guidance
 *
 * 2. TAIL (changes each turn):
 *    - Session checkpoint
 *    - Notes
 *    - Task state
 *    - Active actors
 *    - Continuity reminders
 *
 * The prefix is composed ONCE at session start and never mutated.
 * The tail is recomposed each turn.
 * This ensures DeepSeek's automatic prefix cache stays warm across turns.
 */

export interface CacheStablePrefix {
  readonly prefix: string
  readonly hash: string
  readonly composedAt: number
}

export interface TailContext {
  readonly checkpoint?: string
  readonly notes?: string
  readonly taskState?: string
  readonly activeActors?: string
  readonly continuityReminder?: string
}

export function composePrefix(input: {
  readonly agentSystem: string
  readonly toolDefinitions: string
  readonly docMemory: string
  readonly memoryIndex: string
  readonly skillGuidance: string
}): CacheStablePrefix {
  const parts = [
    input.agentSystem,
    "",
    "## Available Tools",
    input.toolDefinitions,
    "",
    "## Project Memory",
    input.docMemory,
    "",
    "## Memory Index",
    input.memoryIndex,
    "",
    "## Skills",
    input.skillGuidance,
  ].filter(Boolean)

  const prefix = parts.join("\n")
  const hash = simpleHash(prefix)

  return { prefix, hash, composedAt: Date.now() }
}

export function composeTail(ctx: TailContext): string {
  const parts: string[] = []

  if (ctx.checkpoint) {
    parts.push("## Session Checkpoint", ctx.checkpoint, "")
  }
  if (ctx.notes) {
    parts.push("## Session Notes", ctx.notes, "")
  }
  if (ctx.taskState) {
    parts.push("## Task State", ctx.taskState, "")
  }
  if (ctx.activeActors) {
    parts.push("## Active Agents", ctx.activeActors, "")
  }
  if (ctx.continuityReminder) {
    parts.push(ctx.continuityReminder)
  }

  return parts.join("\n")
}

export function hasPrefixChanged(
  current: CacheStablePrefix,
  newPrefix: string,
): boolean {
  return simpleHash(newPrefix) !== current.hash
}

function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return h.toString(36)
}
