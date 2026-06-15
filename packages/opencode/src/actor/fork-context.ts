/**
 * Fork Context - prompt cache alignment for subagents.
 *
 * When a subagent is spawned, the parent's system prompts, tool schemas,
 * and initial messages form a "prefix" that is expensive to re-send.
 * ForkContext captures this prefix so the subagent's first LLM call
 * can reuse it, hitting the prompt cache and saving tokens.
 *
 * Key design:
 * - System prompts are identical across parent/child (same agent config)
 * - Tool schemas may differ (child has restricted set)
 * - The overlapping portion of the prefix is reused
 * - Non-overlapping tools are appended after the shared prefix
 *
 * Ported from MiMo-Code's actor/prefix-capture.ts.
 */

export interface ForkContext {
  /** The parent's system prompt parts (typically 1-3 system messages) */
  readonly systemPrompts: ReadonlyArray<string>
  /** The parent's tool schema definitions (serialized JSON) */
  readonly toolSchemas: ReadonlyArray<unknown>
  /** The parent's model/provider for the child to reuse */
  readonly modelID?: string
  readonly providerID?: string
  /** The parent's message history up to the fork point */
  readonly parentMessages: ReadonlyArray<unknown>
  /** Message ID to use as the watermark for cache alignment */
  readonly watermarkMessageID?: string
}

/**
 * Capture the parent's current context for fork cache alignment.
 * Called just before spawning a subagent.
 */
export function captureForkContext(input: {
  readonly systemPrompts: ReadonlyArray<string>
  readonly toolSchemas: ReadonlyArray<unknown>
  readonly modelID?: string
  readonly providerID?: string
  readonly messages: ReadonlyArray<unknown>
}): ForkContext {
  return {
    systemPrompts: input.systemPrompts,
    toolSchemas: input.toolSchemas,
    modelID: input.modelID,
    providerID: input.providerID,
    parentMessages: input.messages,
    watermarkMessageID: undefined, // set after first LLM call
  }
}

/**
 * Compute the shared prefix between parent and child tool sets.
 * This determines which tool definitions can be reused from cache.
 */
export function computeSharedPrefix(
  parentTools: ReadonlyArray<{ readonly name: string }>,
  childTools: ReadonlyArray<{ readonly name: string }>,
): { readonly sharedCount: number; readonly sharedNames: ReadonlyArray<string> } {
  const childNames = new Set(childTools.map((t) => t.name))
  const shared: string[] = []

  for (const tool of parentTools) {
    if (childNames.has(tool.name)) {
      shared.push(tool.name)
    }
  }

  return { sharedCount: shared.length, sharedNames: shared }
}

/**
 * Estimate the token savings from fork cache alignment.
 *
 * Rough heuristic: shared system prompts + shared tool schemas + prefix messages
 * are already in the parent's cache and will be a cache hit for the child.
 */
export function estimateCacheSavings(ctx: ForkContext): {
  readonly promptTokens: number
  readonly toolTokens: number
  readonly messageTokens: number
  readonly totalSaved: number
} {
  // Rough estimate: ~4 chars per token
  const promptTokens = ctx.systemPrompts.reduce<number>((sum, p) => sum + Math.ceil(p.length / 4), 0)
  const toolTokens = ctx.toolSchemas.reduce<number>((sum, t) => sum + Math.ceil(JSON.stringify(t).length / 4), 0)
  const messageTokens = ctx.parentMessages.reduce<number>((sum, m) => sum + Math.ceil(JSON.stringify(m).length / 4), 0)

  return {
    promptTokens,
    toolTokens,
    messageTokens,
    totalSaved: promptTokens + toolTokens,
  }
}

/**
 * Fork Context Manager - manages fork contexts for active subagents.
 * Stored in-memory (not persisted) since fork contexts are ephemeral.
 */
export class ForkContextManager {
  private readonly contexts = new Map<string, ForkContext>()

  /**
   * Store a fork context for an actor.
   */
  set(actorID: string, ctx: ForkContext): void {
    this.contexts.set(actorID, ctx)
  }

  /**
   * Retrieve and remove a fork context (one-shot).
   */
  consume(actorID: string): ForkContext | undefined {
    const ctx = this.contexts.get(actorID)
    if (ctx) this.contexts.delete(actorID)
    return ctx
  }

  /**
   * Get without consuming (for inspection).
   */
  peek(actorID: string): ForkContext | undefined {
    return this.contexts.get(actorID)
  }

  /**
   * Clear all stored contexts (e.g., on session teardown).
   */
  clear(): void {
    this.contexts.clear()
  }

  /**
   * Number of active fork contexts.
   */
  get size(): number {
    return this.contexts.size
  }
}
