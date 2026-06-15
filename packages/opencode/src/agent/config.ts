// Agent types spawned by runtime code rather than model-authored task calls.
export const SYSTEM_SPAWNED_AGENT_TYPES: ReadonlySet<string> = new Set([
  "checkpoint-writer",
  "dream",
  "distill",
])
