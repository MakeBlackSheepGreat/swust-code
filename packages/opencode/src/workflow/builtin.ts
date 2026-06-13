/**
 * Built-in Workflow Registry
 *
 * Ships pre-built workflows that are available without user configuration.
 * Currently includes: deep-research
 *
 * Ported from MiMo-Code's workflow/builtin.ts.
 */

import { DEEP_RESEARCH_META, DEEP_RESEARCH_SCRIPT } from "./builtin/deep-research"

export interface BuiltinWorkflow {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly phases?: ReadonlyArray<{ readonly title: string; readonly detail?: string }>
  readonly script: string
}

const BUILTINS: Record<string, BuiltinWorkflow> = Object.create(null)

// Register built-in workflows
BUILTINS["deep-research"] = {
  ...DEEP_RESEARCH_META,
  script: DEEP_RESEARCH_SCRIPT,
}

/**
 * List all built-in workflows.
 */
export function listBuiltinWorkflows(): ReadonlyArray<BuiltinWorkflow> {
  return Object.values(BUILTINS).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get a built-in workflow by name.
 */
export function getBuiltinWorkflow(name: string): BuiltinWorkflow | undefined {
  return BUILTINS[name]
}
