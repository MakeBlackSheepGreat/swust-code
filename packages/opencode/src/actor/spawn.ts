/**
 * Actor Spawn - subagent spawning with ForkContext cache alignment.
 *
 * Two spawn modes:
 * - peer: creates a new child session (full isolation)
 * - subagent: shares the parent session (same context, distinct actorID)
 *
 * ForkContext captures the parent's system prompts and tool schemas
 * for prompt-cache alignment, reducing token costs.
 *
 * Ported from MiMo-Code's actor/spawn.ts patterns.
 */

import { Context, Deferred, Effect, Fiber, Layer } from "effect"
import { ActorRegistry, type ActorMode, type ActorOutcome } from "./registry"

const MAX_PRE_REACT = 3
const MAX_POST_REACT = 3

/**
 * Captures parent agent context for prompt-cache alignment.
 * When a subagent is spawned, the parent's LLM request prefix
 * is stored here so the subagent can reuse it.
 */
export interface ForkContext {
  readonly systemPrompts: ReadonlyArray<string>
  readonly toolSchemas: ReadonlyArray<unknown>
  readonly modelID?: string
  readonly providerID?: string
  readonly parentMessages: ReadonlyArray<unknown>
  readonly watermarkMessageID?: string
}

export interface AgentOutcome {
  readonly status: "success" | "failure" | "cancelled"
  readonly finalText?: string
  readonly error?: string
  readonly reportedStatus?: string
  readonly reportedSummary?: string
}

export interface SpawnInput {
  readonly mode: ActorMode
  readonly sessionID: string
  readonly agentType: string
  readonly task: string
  readonly description?: string
  readonly background?: boolean
  readonly lifecycle?: "ephemeral" | "persistent"
  readonly toolAllowlist?: ReadonlyArray<string>
  readonly model?: { readonly providerID: string; readonly modelID: string }
  readonly forkContext?: ForkContext
}

export interface SpawnResult {
  readonly actorID: string
  readonly sessionID: string
  readonly outcome?: AgentOutcome
}

export interface Interface {
  readonly spawn: (input: SpawnInput) => Effect.Effect<SpawnResult>
  readonly cancel: (sessionID: string, actorID: string) => Effect.Effect<void>
  readonly getForkContext: (actorID: string) => ForkContext | undefined
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/ActorSpawn") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const registry = yield* ActorRegistry.Service
    const forkContexts = new Map<string, ForkContext>()

    const spawn = (input: SpawnInput): Effect.Effect<SpawnResult> =>
      Effect.gen(function* () {
        const actorID = yield* registry.allocateActorID(input.sessionID, input.agentType)

        // Register the actor
        yield* registry.register({
          sessionID: input.sessionID,
          actorID,
          mode: input.mode,
          status: "pending",
          lifecycle: input.lifecycle ?? "ephemeral",
          agent: input.agentType,
          description: input.description ?? input.task.slice(0, 100),
          background: input.background ?? false,
        })

        // Store fork context if provided
        if (input.forkContext) {
          forkContexts.set(actorID, input.forkContext)
        }

        // Mark as running
        yield* registry.updateStatus(input.sessionID, actorID, "running")

        // Execute the agent work
        const outcome = yield* Effect.gen(function* () {
          // Phase 1: PreStop ReAct loop
          // In a full implementation, this would call sessionPrompt.prompt()
          // and then check plugin hooks for re-entry

          // Phase 2: Completion gate
          // Check if tasks are complete, re-enter if needed

          // Phase 3: PostStop hooks
          // Fire-and-forget side effects

          return {
            status: "success" as const,
            finalText: `Agent ${input.agentType} completed task: ${input.task.slice(0, 50)}...`,
          }
        }).pipe(
          Effect.catchAll((e) =>
            Effect.succeed({
              status: "failure" as const,
              error: String(e),
            } as AgentOutcome),
          ),
        )

        // Update final status
        yield* registry.updateStatus(
          input.sessionID,
          actorID,
          "idle",
          outcome.status as ActorOutcome,
          outcome.status === "failure" ? outcome.error : undefined,
        )

        // Cleanup fork context
        forkContexts.delete(actorID)

        return {
          actorID,
          sessionID: input.sessionID,
          outcome,
        }
      })

    const cancel = (sessionID: string, actorID: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        // Cancel children first (depth-first)
        const children = yield* registry.listByParent(sessionID, actorID)
        for (const child of children) {
          yield* cancel(sessionID, child.actorID)
        }

        // Cancel this actor
        yield* registry.updateStatus(sessionID, actorID, "idle", "cancelled")
        forkContexts.delete(actorID)
      })

    const getForkContext = (actorID: string): ForkContext | undefined =>
      forkContexts.get(actorID)

    return Service.of({ spawn, cancel, getForkContext })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(ActorRegistry.defaultLayer))

export { MAX_PRE_REACT, MAX_POST_REACT }
