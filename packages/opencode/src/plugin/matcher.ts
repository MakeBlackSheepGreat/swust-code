import { BUILT_IN_AGENTS, type ActorMatcher } from "@swust-code/plugin"

const isBuiltIn = (agentType: string): boolean => (BUILT_IN_AGENTS as readonly string[]).includes(agentType)

export function matchesActor(
  matcher: ActorMatcher | undefined,
  input: { mode: "subagent" | "peer"; agentType: string },
): boolean {
  if (!matcher) return !isBuiltIn(input.agentType)

  if (matcher.mode && matcher.mode !== input.mode) return false

  const agentType = matcher.agentType
  if (agentType === undefined) return !isBuiltIn(input.agentType)

  if (typeof agentType === "string") {
    if (isBuiltIn(input.agentType)) return false
    try {
      return new RegExp(agentType).test(input.agentType)
    } catch {
      return false
    }
  }

  if (Array.isArray(agentType)) return agentType.includes(input.agentType)

  if ("excludeOnly" in agentType) return !agentType.excludeOnly.includes(input.agentType)

  if (agentType.exclude?.includes(input.agentType)) return false
  return agentType.include.includes(input.agentType)
}
