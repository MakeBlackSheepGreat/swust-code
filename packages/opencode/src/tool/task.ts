import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import SHELL_DESCRIPTION from "./task.shell.txt"
import { ToolJsonSchema } from "./json-schema"
import { tokenize } from "./shell-tokenize"
import { TaskRegistry } from "@/task/registry"
import type { SessionID } from "@/session/schema"
import { Effect, Schema } from "effect"

const id = "task"

const KNOWN_VERBS = [
  "create",
  "list",
  "get",
  "start",
  "block",
  "unblock",
  "done",
  "abandon",
  "rename",
]

const TaskStatus = Schema.Literals(["open", "in_progress", "blocked", "done", "abandoned"])
type TaskStatus = Schema.Schema.Type<typeof TaskStatus>

const CreateOperation = Schema.Struct({
  action: Schema.Literal("create"),
  summary: Schema.String.annotate({ description: "Task summary for a single task." }),
  parent_id: Schema.optional(Schema.String).annotate({ description: "Parent task id for sub-tasks." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const ListOperation = Schema.Struct({
  action: Schema.Literal("list"),
  status: Schema.optional(TaskStatus).annotate({ description: "Filter by status." }),
  include_terminal: Schema.optional(Schema.Boolean).annotate({ description: "Include done/abandoned tasks. Default false." }),
  include_archived: Schema.optional(Schema.Boolean).annotate({ description: "Include archived tasks. Default false." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const GetOperation = Schema.Struct({
  action: Schema.Literal("get"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const StartOperation = Schema.Struct({
  action: Schema.Literal("start"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  event_summary: Schema.optional(Schema.String).annotate({ description: "Short note on starting." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const BlockOperation = Schema.Struct({
  action: Schema.Literal("block"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  event_summary: Schema.optional(Schema.String).annotate({ description: "Short reason for blocking." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const UnblockOperation = Schema.Struct({
  action: Schema.Literal("unblock"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  event_summary: Schema.optional(Schema.String).annotate({ description: "Short reason for unblocking." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const DoneOperation = Schema.Struct({
  action: Schema.Literal("done"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  event_summary: Schema.optional(Schema.String).annotate({ description: "Short summary of what was completed." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const AbandonOperation = Schema.Struct({
  action: Schema.Literal("abandon"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  event_summary: Schema.optional(Schema.String).annotate({ description: "Short reason for abandoning." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const RenameOperation = Schema.Struct({
  action: Schema.Literal("rename"),
  id: Schema.String.annotate({ description: "Task id, e.g. T1 or T1.1." }),
  summary: Schema.String.annotate({ description: "New task summary." }),
  session_id: Schema.optional(Schema.String).annotate({ description: "Session id to act on. Defaults to current session." }),
})

const Operation = Schema.Union([
  CreateOperation,
  ListOperation,
  GetOperation,
  StartOperation,
  BlockOperation,
  UnblockOperation,
  DoneOperation,
  AbandonOperation,
  RenameOperation,
]).annotate({ discriminator: "action" })

export const Parameters = Schema.Struct({
  operation: Operation,
})

type Parameters = Schema.Schema.Type<typeof Parameters>
type TaskOperation = Parameters

type Metadata = {
  id?: string
  status?: string
  ids?: string[]
  count?: number
}

function owner(ctx: Tool.Context) {
  return typeof ctx.extra?.actorID === "string" ? ctx.extra.actorID : ctx.agent
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function suggestVerb(input: string): string | undefined {
  const candidates = KNOWN_VERBS.map((verb) => ({ verb, distance: levenshtein(input, verb) })).filter(
    (candidate) => candidate.distance <= 2,
  )
  if (candidates.length !== 1) return undefined
  return candidates[0].verb
}

function extractTaskFlags(
  args: string[],
  valueFlags: string[],
  boolFlags: string[],
): { flags: Record<string, string>; bools: Record<string, boolean>; rest: string[]; error?: string } {
  const rest: string[] = []
  const flags: Record<string, string> = {}
  const bools: Record<string, boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const boolName = boolFlags.find((name) => arg === `--${name}`)
    if (boolName) {
      bools[boolName] = true
      continue
    }
    const valueName = valueFlags.find((name) => arg === `--${name}`)
    if (valueName) {
      const next = args[i + 1]
      if (next === undefined) return { flags, bools, rest, error: `--${valueName} requires a value` }
      flags[valueName] = next
      i++
      continue
    }
    const equalsName = valueFlags.find((name) => arg.startsWith(`--${name}=`))
    if (equalsName) {
      const value = arg.slice(`--${equalsName}=`.length)
      if (value === "") return { flags, bools, rest, error: `--${equalsName} requires a value` }
      flags[equalsName] = value
      continue
    }
    rest.push(arg)
  }
  return { flags, bools, rest }
}

function flagError(verb: string, detail: string, line: number) {
  return Effect.fail({ kind: "flag" as const, line, detail: `task: ${verb}: ${detail}` })
}

function arityError(verb: string, expected: string, args: string[], line: number) {
  return Effect.fail({
    kind: "arity" as const,
    line,
    detail: `task: ${verb}: arity mismatch\n  got:      task ${verb} ${args.join(" ")}\n  expected: task ${verb} ${expected}`,
  })
}

function mapVerb(verb: string | undefined, args: string[], line: number): Effect.Effect<TaskOperation, unknown> {
  switch (verb) {
    case "create": {
      const { flags, rest, error } = extractTaskFlags(args, ["parent", "session"], [])
      if (error) return flagError("create", error, line)
      if (rest.length !== 1) return arityError("create", '<summary> [--parent <TID>] [--session <id>]', rest, line)
      return Effect.succeed({
        operation: {
          action: "create",
          summary: rest[0],
          ...(flags.parent ? { parent_id: flags.parent } : {}),
          ...(flags.session ? { session_id: flags.session } : {}),
        },
      })
    }
    case "list": {
      const { flags, bools, rest, error } = extractTaskFlags(args, ["session"], ["include-terminal", "include-archived"])
      if (error) return flagError("list", error, line)
      if (rest.length > 1)
        return arityError("list", "[<status>] [--include-terminal] [--include-archived] [--session <id>]", rest, line)
      return Effect.succeed({
        operation: {
          action: "list",
          ...(rest.length === 1 ? { status: rest[0] as TaskStatus } : {}),
          ...(bools["include-terminal"] ? { include_terminal: true } : {}),
          ...(bools["include-archived"] ? { include_archived: true } : {}),
          ...(flags.session ? { session_id: flags.session } : {}),
        },
      })
    }
    case "get": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("get", error, line)
      if (rest.length !== 1) return arityError("get", "<id> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "get", id: rest[0], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    case "start": {
      const { flags, rest, error } = extractTaskFlags(args, ["reason", "session"], [])
      if (error) return flagError("start", error, line)
      if (rest.length !== 1) return arityError("start", "<id> [--reason <note>] [--session <id>]", rest, line)
      return Effect.succeed({
        operation: {
          action: "start",
          id: rest[0],
          ...(flags.reason ? { event_summary: flags.reason } : {}),
          ...(flags.session ? { session_id: flags.session } : {}),
        },
      })
    }
    case "block": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("block", error, line)
      if (rest.length !== 2) return arityError("block", "<id> <reason> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "block", id: rest[0], event_summary: rest[1], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    case "unblock": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("unblock", error, line)
      if (rest.length !== 2) return arityError("unblock", "<id> <reason> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "unblock", id: rest[0], event_summary: rest[1], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    case "done": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("done", error, line)
      if (rest.length !== 2) return arityError("done", "<id> <summary> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "done", id: rest[0], event_summary: rest[1], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    case "abandon": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("abandon", error, line)
      if (rest.length !== 2) return arityError("abandon", "<id> <reason> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "abandon", id: rest[0], event_summary: rest[1], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    case "rename": {
      const { flags, rest, error } = extractTaskFlags(args, ["session"], [])
      if (error) return flagError("rename", error, line)
      if (rest.length !== 2) return arityError("rename", "<id> <summary> [--session <id>]", rest, line)
      return Effect.succeed({ operation: { action: "rename", id: rest[0], summary: rest[1], ...(flags.session ? { session_id: flags.session } : {}) } })
    }
    default: {
      const suggestion = suggestVerb(verb ?? "")
      const detail =
        `task: unknown verb "${verb ?? ""}"\n` +
        `  available verbs: ${KNOWN_VERBS.join(", ")}` +
        (suggestion ? `\n  did you mean: ${suggestion}?` : "")
      return Effect.fail({ kind: "unknown-verb" as const, line, detail })
    }
  }
}

export function parseTaskScript(script: string): Effect.Effect<TaskOperation[], unknown> {
  return Effect.gen(function* () {
    const argvList = yield* tokenize(script)
    const out: TaskOperation[] = []
    for (const argv of argvList) {
      const [head, verb, ...rest] = argv.tokens
      if (head !== "task") {
        return yield* Effect.fail({
          kind: "unknown-verb" as const,
          line: argv.line,
          detail: `task: every command must start with 'task' (got '${head ?? ""}')`,
        })
      }
      out.push(yield* mapVerb(verb, rest, argv.line))
    }
    return out
  })
}

export function recoverTaskArgs(rawArgs: unknown): TaskOperation | undefined {
  if (rawArgs == null || typeof rawArgs !== "object") return undefined
  let obj = rawArgs as Record<string, unknown>
  if (typeof obj.operation === "string") {
    try {
      const inner = JSON.parse(obj.operation)
      if (inner && typeof inner === "object" && !Array.isArray(inner)) obj = { operation: inner }
    } catch {}
  }
  if (obj.operation && typeof obj.operation === "object" && !Array.isArray(obj.operation))
    return { operation: obj.operation } as TaskOperation
  if (typeof obj.summary === "string") {
    const op: Record<string, unknown> = { action: "create", summary: obj.summary }
    if (typeof obj.parent_id === "string") op.parent_id = obj.parent_id
    if (typeof obj.session_id === "string") op.session_id = obj.session_id
    return { operation: op } as TaskOperation
  }
  return undefined
}

export const TaskTool = Tool.define<typeof Parameters, Metadata, TaskRegistry.Service>(
  id,
  Effect.gen(function* () {
    const reg = yield* TaskRegistry.Service

    const run = Effect.fn("TaskTool.execute")(function* (input: Parameters, ctx: Tool.Context<Metadata>) {
      const op = input.operation
      const sessionID = (op.session_id || ctx.sessionID) as SessionID

      if (op.action === "create") {
        const task = yield* reg.create({
          session_id: sessionID,
          summary: op.summary,
          parent_id: op.parent_id || undefined,
          owner: owner(ctx),
        })
        return {
          title: `Task created: ${task.id}`,
          output: `Created ${task.id} (${task.status}): ${task.summary}`,
          metadata: { id: task.id, status: task.status },
        }
      }

      if (op.action === "list") {
        const tasks = yield* reg.list({
          session_id: sessionID,
          status: op.status,
          include_terminal: op.include_terminal,
          include_archived: op.include_archived,
        })
        const lines =
          tasks.length === 0
            ? ["No tasks."]
            : tasks.map((task) => `${task.id} ${task.status} - ${task.summary}`)
        return {
          title: `Tasks: ${tasks.length}`,
          output: lines.join("\n"),
          metadata: { count: tasks.length, ids: tasks.map((task) => task.id) },
        }
      }

      if (op.action === "get") {
        const task = yield* reg.get({ session_id: sessionID, id: op.id })
        if (!task) {
          return {
            title: `Task ${op.id}: not found`,
            output: `No task ${op.id}`,
            metadata: {},
          }
        }
        return {
          title: `Task ${op.id}: ${task.status}`,
          output: JSON.stringify(task, null, 2),
          metadata: { id: task.id, status: task.status },
        }
      }

      if (op.action === "start") {
        const result = yield* reg.start({ session_id: sessionID, id: op.id, owner: owner(ctx), event_summary: op.event_summary })
        return {
          title: `Task ${op.id}: ${result.status}`,
          output: `start -> ${result.status}`,
          metadata: { id: result.id, status: result.status },
        }
      }

      if (op.action === "block") {
        const result = yield* reg.block({ session_id: sessionID, id: op.id, event_summary: op.event_summary })
        return {
          title: `Task ${op.id}: blocked`,
          output: `block -> ${result.status}`,
          metadata: { id: result.id, status: result.status },
        }
      }

      if (op.action === "unblock") {
        const result = yield* reg.unblock({ session_id: sessionID, id: op.id, event_summary: op.event_summary })
        return {
          title: `Task ${op.id}: ${result.status}`,
          output: `unblock -> ${result.status}`,
          metadata: { id: result.id, status: result.status },
        }
      }

      if (op.action === "done") {
        const result = yield* reg.done({ session_id: sessionID, id: op.id, event_summary: op.event_summary })
        return {
          title: `Task ${op.id}: done`,
          output: `done -> ${result.status}`,
          metadata: { id: result.id, status: result.status },
        }
      }

      if (op.action === "abandon") {
        const result = yield* reg.abandon({ session_id: sessionID, id: op.id, event_summary: op.event_summary })
        return {
          title: `Task ${op.id}: abandoned`,
          output: `abandon -> ${result.status}`,
          metadata: { id: result.id, status: result.status },
        }
      }

      if (op.action === "rename") {
        const result = yield* reg.rename({ session_id: sessionID, id: op.id, summary: op.summary })
        return {
          title: `Task ${op.id}: renamed`,
          output: `rename -> "${result.summary}"`,
          metadata: { id: result.id, status: result.status },
        }
      }

      return yield* Effect.fail(new Error(`Unknown operation: ${(op as { action: string }).action}`))
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      jsonSchema: ToolJsonSchema.fromSchema(Parameters),
      execute: (args: Parameters, ctx: Tool.Context<Metadata>) => run(args, ctx).pipe(Effect.orDie),
      shell: {
        description: SHELL_DESCRIPTION,
        parse: parseTaskScript,
        recover: recoverTaskArgs,
      },
    }
  }),
)
