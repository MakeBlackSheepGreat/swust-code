/**
 * Coordinator/Worker multi-agent protocol.
 *
 * In coordinator mode, a primary agent orchestrates multiple worker agents
 * through a structured protocol:
 *
 * 1. Coordinator spawns workers via AgentTool
 * 2. Workers execute with a restricted tool set
 * 3. Workers report results via <task-notification> XML
 * 4. Coordinator synthesizes results and decides next steps
 *
 * Phased workflow: Research → Synthesis → Implementation → Verification
 *
 * Ported from Claude-Code's coordinator/coordinatorMode.ts patterns.
 */

import { Context, Effect, Layer } from "effect"

// Feature flag check
export function isCoordinatorMode(): boolean {
  return process.env.SWUST_CODE_COORDINATOR_MODE === "1" ||
    process.env.SWUST_CODE_COORDINATOR_MODE === "true"
}

// Worker tool restriction
const INTERNAL_COORDINATOR_TOOLS = new Set([
  "agent_create",
  "agent_delete",
  "send_message",
  "synthetic_output",
])

/**
 * Get the restricted tool set for worker agents.
 * Workers don't get coordinator-only tools.
 */
export function getWorkerToolAllowlist(allTools: ReadonlyArray<string>): ReadonlyArray<string> {
  return allTools.filter((t) => !INTERNAL_COORDINATOR_TOOLS.has(t))
}

/**
 * Coordinator system prompt defining the orchestration protocol.
 */
export const COORDINATOR_SYSTEM_PROMPT = `You are a coordinator agent that orchestrates multiple worker agents.

## Your Role
- Orchestrate, synthesize, communicate — never do trivial tool work yourself
- Break complex tasks into parallelizable units
- Assign work to specialized worker agents
- Synthesize worker results into a coherent response

## Available Tools
- \`agent_create\`: Spawn a new worker agent with a specific task
- \`send_message\`: Send a follow-up message to an existing worker
- \`agent_delete\`: Kill a worker that is no longer needed

## Worker Communication Protocol
Workers report results using <task-notification> XML tags in their responses:

\`\`\`xml
<task-notification>
  <status>completed|failed|partial</status>
  <summary>Brief summary of what was accomplished</summary>
  <files>file1.ts, file2.ts</files>
  <findings>Key findings worth noting</findings>
</task-notification>
\`\`\`

## Phased Workflow

### Phase 1: Research (parallel)
Spawn multiple workers to explore different aspects of the problem simultaneously.
Each worker should gather information independently.

### Phase 2: Synthesis (coordinator)
Analyze worker results. Identify gaps, conflicts, and dependencies.
Plan the implementation approach.

### Phase 3: Implementation (workers)
Spawn workers for implementation tasks. Each worker should:
- Focus on a single unit of work
- Report progress via task notifications
- Request clarification when needed

### Phase 4: Verification (workers)
Spawn verification workers to review implementation.
Each verifier should check correctness, style, and completeness.

## Anti-Patterns (DO NOT)
- Never delegate understanding ("based on your findings, fix the bug")
- Never fabricate results you haven't verified
- Never use one worker to check another worker's output
- Never spawn workers for trivial tasks you can do directly
- Never leave workers running without monitoring their results

## Decision Rules
- **Continue existing worker**: When the task has context overlap with an active worker
- **Spawn fresh worker**: When the task is independent or the existing worker's context is stale
- **Do it yourself**: When the task is trivial (< 1 tool call) or requires coordination judgment
`

/**
 * Generate the coordinator's user context listing available tools.
 */
export function getCoordinatorUserContext(
  availableTools: ReadonlyArray<string>,
  activeWorkers: ReadonlyArray<{ readonly id: string; readonly agent: string; readonly status: string }>,
): string {
  const parts: string[] = []

  parts.push("## Available Tools")
  for (const tool of availableTools) {
    if (!INTERNAL_COORDINATOR_TOOLS.has(tool)) continue
    parts.push(`- \`${tool}\``)
  }

  if (activeWorkers.length > 0) {
    parts.push("\n## Active Workers")
    for (const w of activeWorkers) {
      parts.push(`- **${w.id}** [${w.agent}] — ${w.status}`)
    }
  }

  return parts.join("\n")
}

/**
 * Parse a task-notification XML from a worker response.
 */
export interface TaskNotification {
  readonly status: "completed" | "failed" | "partial"
  readonly summary: string
  readonly files?: string
  readonly findings?: string
}

export function parseTaskNotification(xml: string): TaskNotification | null {
  const statusMatch = xml.match(/<status>(.*?)<\/status>/)
  const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/)
  if (!statusMatch || !summaryMatch) return null

  const filesMatch = xml.match(/<files>(.*?)<\/files>/)
  const findingsMatch = xml.match(/<findings>([\s\S]*?)<\/findings>/)

  return {
    status: statusMatch[1] as TaskNotification["status"],
    summary: summaryMatch[1].trim(),
    files: filesMatch?.[1]?.trim(),
    findings: findingsMatch?.[1]?.trim(),
  }
}

export interface Interface {
  readonly isEnabled: () => boolean
  readonly getCoordinatorPrompt: () => string
  readonly getWorkerAllowlist: (allTools: ReadonlyArray<string>) => ReadonlyArray<string>
  readonly parseNotification: (xml: string) => TaskNotification | null
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Coordinator") {}

export const layer = Layer.effect(
  Service,
  Effect.sync(() =>
    Service.of({
      isEnabled: isCoordinatorMode,
      getCoordinatorPrompt: () => COORDINATOR_SYSTEM_PROMPT,
      getWorkerAllowlist: getWorkerToolAllowlist,
      parseNotification: parseTaskNotification,
    }),
  ),
)

export const defaultLayer = layer
