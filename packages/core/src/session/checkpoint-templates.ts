/**
 * Checkpoint Templates - structured section-based session state.
 *
 * Three templates define the structure for persistent session artifacts:
 * - CHECKPOINT: 11 sections for per-session ephemeral state (~11K tokens)
 * - MEMORY: 4 sections for cross-session durable state (~10K tokens)
 * - NOTES: Free-form scratchpad with timestamped entries
 *
 * Each section has a token budget that the checkpoint writer must respect.
 * The renderRebuildContext function reads these files with section-aware
 * truncation to fit within the LLM's context window.
 *
 * Ported from MiMo-Code's checkpoint-templates.ts.
 */

// ---------------------------------------------------------------------------
// Checkpoint Template (11 sections, ~11K tokens total)
// ---------------------------------------------------------------------------

export const CHECKPOINT_TEMPLATE = `# Session Checkpoint

## SS1 Active Intent
<!-- 500 tokens budget -->
<!-- Verbatim user request that started this session -->

## SS2 Next Concrete Action
<!-- 1000 tokens budget -->
<!-- The single most important next step -->

## SS3 Directives
<!-- 800 tokens budget -->
<!-- Session-specific working style, NOT project rules -->

## SS4 Task Tree
<!-- 1000 tokens budget -->
<!-- Hierarchical task list with status icons -->

## SS5 Current Work
<!-- 2000 tokens budget -->
<!-- What was being done immediately before checkpoint -->

## SS6 Files and Code Sections
<!-- 1500 tokens budget -->
<!-- One-line purpose per file/section touched -->

## SS7 Discovered Knowledge
<!-- 2000 tokens budget -->
<!-- Cross-task facts, candidates for promotion to MEMORY.md -->

## SS8 Errors and Fixes
<!-- 1500 tokens budget -->
<!-- Newest first: error + resolution pattern -->

## SS9 Live Resources
<!-- 1000 tokens budget -->
<!-- Branch, uncommitted files, running processes, URLs -->

## SS10 Design Decisions
<!-- 3000 tokens budget -->
<!-- Decision + rationale + date. WHY, not WHAT. -->

## SS11 Open Notes
<!-- 800 tokens budget -->
<!-- Catch-all for items not fitting elsewhere -->
`

export const CHECKPOINT_SECTION_BUDGETS: Record<string, number> = {
  "SS1 Active Intent": 500,
  "SS2 Next Concrete Action": 1000,
  "SS3 Directives": 800,
  "SS4 Task Tree": 1000,
  "SS5 Current Work": 2000,
  "SS6 Files and Code Sections": 1500,
  "SS7 Discovered Knowledge": 2000,
  "SS8 Errors and Fixes": 1500,
  "SS9 Live Resources": 1000,
  "SS10 Design Decisions": 3000,
  "SS11 Open Notes": 800,
}

export const CHECKPOINT_TOTAL_BUDGET = Object.values(CHECKPOINT_SECTION_BUDGETS).reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// Memory Template (4 sections, ~10K tokens total)
// ---------------------------------------------------------------------------

export const MEMORY_TEMPLATE = `# Project Memory

## Project Context
<!-- 1000 tokens budget -->
<!-- What is this project? Tech stack, purpose, structure. -->

## Rules
<!-- 2000 tokens budget -->
<!-- Hard constraints: coding standards, naming conventions, forbidden patterns. -->

## Architecture Decisions
<!-- 3000 tokens budget -->
<!-- Key design choices with rationale and dates. Format: YYYY-MM-DD decision + reason. -->

## Discovered Durable Knowledge
<!-- 4000 tokens budget -->
<!-- Cross-session facts promoted from checkpoint SS7. Patterns, gotchas, solutions. -->
`

export const MEMORY_SECTION_BUDGETS: Record<string, number> = {
  "Project Context": 1000,
  "Rules": 2000,
  "Architecture Decisions": 3000,
  "Discovered Durable Knowledge": 4000,
}

export const MEMORY_TOTAL_BUDGET = Object.values(MEMORY_SECTION_BUDGETS).reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// Notes Template (free-form scratchpad)
// ---------------------------------------------------------------------------

export const NOTES_TEMPLATE = `# Session Notes

<!-- Free-form scratchpad for the main agent. -->
<!-- Format: ## [turn N · YYYY-MM-DDTHH:MM:SSZ] -->
<!-- Scan existing entries before appending to avoid duplication. -->
`

// ---------------------------------------------------------------------------
// Rebuild Context Budgets
// ---------------------------------------------------------------------------

/** Maximum tokens for the rebuild context injected after compaction */
export const REBUILD_CONTEXT_MAX_TOKENS = 40_000

/** Budget for the tasks ledger section in rebuild context */
export const TASKS_LEDGER_BUDGET = 2000

/** Budget for active actors section in rebuild context */
export const ACTIVE_ACTORS_BUDGET = 500

/** Budget for memory keys index section in rebuild context */
export const MEMORY_KEYS_BUDGET = 500

// ---------------------------------------------------------------------------
// Tail Preservation Constants
// ---------------------------------------------------------------------------

/** Minimum tokens to preserve in the tail after compaction */
export const TAIL_MIN_TOKENS = 10_000

/** Maximum tokens to preserve in the tail after compaction */
export const TAIL_MAX_TOKENS = 20_000

/** Minimum number of text-block messages in the tail */
export const TAIL_MIN_TEXT_BLOCK_MESSAGES = 5

/**
 * Tools whose tool_result content can be cleared during microcompact.
 * These are either large-and-regeneratable (read, grep, bash) or
 * just "done" confirmations (edit, write). The tool_use parts are
 * preserved so the LLM still sees what action was taken.
 */
export const COMPACTABLE_TOOL_NAMES = new Set([
  "read",
  "bash",
  "grep",
  "glob",
  "webfetch",
  "websearch",
  "edit",
  "write",
  "multiedit",
  "apply_patch",
  "codesearch",
])

/**
 * Tools that must NOT be compacted -- they carry state the LLM
 * references later.
 */
export const NON_COMPACTABLE_TOOL_NAMES = new Set([
  "actor",
  "task",
  "question",
  "skill",
  "memory",
  "memory_write",
  "todowrite",
])
