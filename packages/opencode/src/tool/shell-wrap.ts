import { Cause, Effect, Schema } from "effect"
import * as Tool from "./tool"
import { ToolJsonSchema } from "./json-schema"

export const shellInputSchema = Schema.Struct({
  script: Schema.String.annotate({
    description: [
      "Multi-line shell-style script. Each non-blank line is one command; commands run sequentially and stop on first failure.",
      'Quoting: "..." preserves literal newlines and processes \\" \\\\ escapes; \'...\' is verbatim.',
      "<<EOF heredoc bodies are fully verbatim (no escape, no $vars).",
      "# starts a line comment to end-of-line (quoted # is literal).",
      "Variables ($VAR, ${VAR}) are preserved as literal text - no expansion.",
      "See the tool description for the verb table.",
    ].join(" "),
  }),
})

type ShellInput = Schema.Schema.Type<typeof shellInputSchema>

export function shellWrap<P extends Schema.Decoder<unknown>, M extends Tool.Metadata>(
  def: Tool.Def<P, M>,
): Tool.Def<typeof shellInputSchema, Tool.Metadata> {
  if (!def.shell) throw new Error(`shellWrap called on tool '${def.id}' that has no shell field`)
  const shell = def.shell
  return {
    id: def.id,
    description: shell.description,
    parameters: shellInputSchema,
    jsonSchema: ToolJsonSchema.fromSchema(shellInputSchema),
    execute: (args: ShellInput, ctx) =>
      Effect.gen(function* () {
        if (typeof args.script !== "string" || args.script.trim() === "") {
          const recovered = shell.recover?.(args as unknown)
          if (recovered !== undefined) {
            const operation = operationLabel(recovered)
            const exit = yield* Effect.exit(def.execute(recovered, ctx as Tool.Context))
            if (exit._tag === "Failure") {
              return {
                title: `${def.id}: invalid arguments`,
                output: formatFailedCommandNoVerb(jsonTeachingBody(def.id, describeFailure(exit.cause))),
                metadata: { commands: 0, success: 0 },
              }
            }
            return {
              title: `${def.id}: ${operation}`,
              output: exit.value.output,
              metadata: { ...(exit.value.metadata as Tool.Metadata), commands: 1, success: 1 },
            }
          }
          const raw = typeof args === "object" && args ? (args as Record<string, unknown>) : {}
          const body = "script" in raw ? shellTeachingBody(def.id) : jsonTeachingBody(def.id)
          return {
            title: `${def.id}: missing script`,
            output: formatFailedCommandNoVerb(body),
            metadata: { commands: 0, success: 0 },
          }
        }

        const parseExit = yield* Effect.exit(shell.parse(args.script))
        if (parseExit._tag === "Failure") {
          return {
            title: `${def.id}: parse error`,
            output: formatFailedCommandNoVerb(formatParseError(def.id, Cause.squash(parseExit.cause))),
            metadata: { commands: 0, success: 0 },
          }
        }

        const parsedList = parseExit.value
        if (parsedList.length === 0) {
          return {
            title: `${def.id}: empty script`,
            output: formatFailedCommandNoVerb(`${def.id}: no commands found in script`),
            metadata: { commands: 0, success: 0 },
          }
        }

        const blocks: string[] = []
        let lastMetadata: Tool.Metadata = {}
        let success = 0
        for (let i = 0; i < parsedList.length; i++) {
          const parsed = parsedList[i]
          const operation = operationLabel(parsed)
          const exit = yield* Effect.exit(def.execute(parsed, ctx as Tool.Context))
          if (exit._tag === "Failure") {
            blocks.push(formatFailedCommand(i + 1, operation, describeFailure(exit.cause)))
            if (i + 1 < parsedList.length) {
              blocks.push(`<not-executed>commands #${i + 2}..#${parsedList.length}</not-executed>`)
            }
            return {
              title: `${def.id}: command #${i + 1} failed`,
              output: blocks.join("\n"),
              metadata: { commands: parsedList.length, success },
            }
          }
          success++
          lastMetadata = exit.value.metadata as Tool.Metadata
          blocks.push(formatOkCommand(i + 1, operation, exit.value.output))
        }
        return {
          title: `${def.id}: ${parsedList.length} command(s)`,
          output: blocks.join("\n"),
          metadata: { ...lastMetadata, commands: parsedList.length, success },
        }
      }),
  }
}

function formatOkCommand(index: number, operation: string, body: string): string {
  return `<command index="${index}" operation="${escapeAttr(operation)}">\n${body}\n</command>`
}

function formatFailedCommand(index: number, operation: string, body: string): string {
  return `<command index="${index}" operation="${escapeAttr(operation)}" failed="true">\n${body}\n</command>`
}

function operationLabel(parsed: unknown): string {
  const op = (parsed as { operation?: unknown } | null | undefined)?.operation
  if (typeof op === "string") return op
  if (op && typeof op === "object" && typeof (op as { action?: unknown }).action === "string") {
    return (op as { action: string }).action
  }
  return "?"
}

function escapeAttr(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function describeFailure(cause: Cause.Cause<unknown>): string {
  const squashed = Cause.squash(cause)
  if (squashed instanceof Error) return squashed.message
  return String(squashed)
}

function formatFailedCommandNoVerb(body: string): string {
  return `<command failed="true">\n${body}\n</command>`
}

function shellTeachingBody(toolId: string): string {
  return [
    `${toolId}: this tool takes a single \`script\` string (shell-style), not JSON fields.`,
    `Put the command in \`script\`, e.g.:  ${toolId} <verb> ...`,
    "See the tool description for the verb list and examples.",
  ].join("\n")
}

function jsonTeachingBody(toolId: string, detail?: string): string {
  return [
    `${toolId}: could not run the call.`,
    `Pass the operation as JSON, e.g.:  {"operation":{"action":"<verb>", ...}}`,
    ...(detail ? [`detail: ${detail}`] : []),
  ].join("\n")
}

function formatParseError(toolId: string, error: unknown): string {
  if (error && typeof error === "object" && "kind" in error) {
    const e = error as { kind: string; line?: number; detail?: string }
    const line = e.line ?? "?"
    return `${toolId}: parse error at line ${line}\n  ${e.detail ?? e.kind}`
  }
  if (error instanceof Error) return `${toolId}: parse error\n  ${error.message}`
  return `${toolId}: parse error\n  ${String(error)}`
}
