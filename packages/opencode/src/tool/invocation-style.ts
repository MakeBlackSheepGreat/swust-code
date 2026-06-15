export type InvocationStyle = "json" | "shell"

export interface ToolStyleConfig {
  invocation_style?: InvocationStyle
  invocation_style_by_tool?: Record<string, InvocationStyle>
}

export function resolveInvocationStyle(cfg: ToolStyleConfig | undefined, toolId: string): InvocationStyle {
  return cfg?.invocation_style_by_tool?.[toolId] ?? cfg?.invocation_style ?? "json"
}
