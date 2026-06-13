/**
 * Step classifier for the agent run loop.
 *
 * Determines whether an assistant step is terminal (loop should break)
 * or should continue (loop should re-enter). This is the single source
 * of truth called from all classification sites in the runLoop.
 *
 * Ported from MiMo-Code's classify.ts with adaptations for SWUST Code.
 */

export type StepClassification =
  | { readonly type: "final"; readonly degraded?: boolean }
  | { readonly type: "continue" }
  | { readonly type: "filtered" }
  | { readonly type: "think-only" }
  | { readonly type: "invalid"; readonly reason: string }
  | { readonly type: "failed"; readonly reason: string }

export interface ClassifyInput {
  readonly finishReason?: string
  readonly hasError: boolean
  readonly hasText: boolean
  readonly hasStructuredOutput: boolean
  readonly hasSummary: boolean
  readonly hasPendingToolCalls: boolean
  readonly hasReasoningOnly: boolean
}

/**
 * Classify an assistant step using a deterministic priority cascade.
 *
 * Priority order (highest first):
 * 1. Pending tool calls → continue (tool observations must be fed back)
 * 2. No finish reason → continue (still streaming)
 * 3. Tool calls pending (provider-executed) → continue
 * 4. Error → failed
 * 5. Structured output → final (always terminal)
 * 6. Summary → final (always terminal)
 * 7. Content filter → filtered
 * 8. Finish error → failed
 * 9. Stop/length/other with text → final
 * 10. Reasoning only → think-only
 * 11. Empty output → invalid
 */
export function classifyStep(input: ClassifyInput): StepClassification {
  // 1. Pending tool calls must be fed back to the model
  if (input.hasPendingToolCalls) {
    return { type: "continue" }
  }

  // 2. No finish reason yet - still streaming
  if (!input.finishReason) {
    return { type: "continue" }
  }

  // 3. Error state
  if (input.hasError) {
    return { type: "failed", reason: "Assistant message has error" }
  }

  // 4. Structured output is always terminal
  if (input.hasStructuredOutput) {
    return { type: "final" }
  }

  // 5. Summary is always terminal
  if (input.hasSummary) {
    return { type: "final" }
  }

  // 6. Content filter
  if (input.finishReason === "content-filter") {
    return { type: "filtered" }
  }

  // 7. Finish error
  if (input.finishReason === "error") {
    return { type: "failed", reason: "Model returned error finish reason" }
  }

  // 8. Normal stop with content
  if (
    input.finishReason === "stop" ||
    input.finishReason === "length" ||
    input.finishReason === "end_turn"
  ) {
    if (input.hasText) {
      return input.finishReason === "length"
        ? { type: "final", degraded: true }
        : { type: "final" }
    }
  }

  // 9. Reasoning only (no usable text)
  if (input.hasReasoningOnly) {
    return { type: "think-only" }
  }

  // 10. Empty output
  return { type: "invalid", reason: "Model produced no usable output" }
}

/**
 * Check if a classification represents a terminal state.
 */
export function isTerminal(classification: StepClassification): boolean {
  return classification.type === "final" || classification.type === "filtered"
}

/**
 * Check if a classification should trigger a retry.
 */
export function shouldRetry(classification: StepClassification): boolean {
  return classification.type === "think-only" || classification.type === "invalid"
}
