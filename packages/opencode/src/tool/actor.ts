import * as Tool from "./tool"
import DESCRIPTION from "./actor.txt"
import SHELL_DESCRIPTION from "./actor.shell.txt"
import { ToolJsonSchema } from "./json-schema"
import { tokenize } from "./shell-tokenize"
import { BackgroundJob } from "@/background/job"
import * as ActorRegistry from "@/actor/registry"
import { spawnRef } from "@/actor/spawn-ref"
import { inboxServiceRef } from "@/inbox"
import { TaskRegistry } from "@/task/registry"
import { TaskID } from "@/task/schema"
import { Agent } from "@/agent/agent"
import { SessionID } from "@/session/schema"
import { SessionCheckpoint } from "@/session/checkpoint"
import { parseReturnHeader } from "@/actor/return-header"
import { ProviderV2 } from "@swust-code/core/provider"
import { ModelV2 } from "@swust-code/core/model"
import { Cause, Deferred, Effect, Result, Schema } from "effect"

type ActorRunState = {
  actorID: string
  description: string
  agent: string
  childSessionID?: SessionID
  result?: string
  error?: string
  background: boolean
}

type TaskBinding = {
  taskID?: string
  notice?: string
}

const id = "actor"

const ContextMode = Schema.Literals(["none", "state", "full"])
const OutputSchema = Schema.Record(Schema.String, Schema.Unknown)
const SubagentType = Schema.String.annotate({ description: "The type of specialized agent to use for this task" })
type SubagentTypeSchema = typeof SubagentType

function runOperation(subagentType: SubagentTypeSchema) {
  return Schema.Struct({
    action: Schema.Literal("run"),
    subagent_type: subagentType,
    description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
    prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
    model: Schema.optional(Schema.String).annotate({ description: "Optional model reference for MiMo compatibility" }),
    actor_id: Schema.optional(Schema.String).annotate({ description: "Resume or reuse an existing actor id" }),
    timeout_ms: Schema.optional(Schema.Int).annotate({ description: "Milliseconds to wait before timing out" }),
    command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this actor" }),
    context: Schema.optional(ContextMode).annotate({ description: "Context inheritance mode: none, state, or full" }),
    task_id: Schema.optional(Schema.String).annotate({ description: "MiMo task-tree id; accepted for compatibility" }),
    output_schema: Schema.optional(OutputSchema).annotate({ description: "JSON schema requested for subagent output" }),
  })
}

function spawnOperation(subagentType: SubagentTypeSchema) {
  return Schema.Struct({
    action: Schema.Literal("spawn"),
    subagent_type: subagentType,
    description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
    prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
    model: Schema.optional(Schema.String).annotate({ description: "Optional model reference for MiMo compatibility" }),
    actor_id: Schema.optional(Schema.String).annotate({ description: "Resume or reuse an existing actor id" }),
    command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this actor" }),
    context: Schema.optional(ContextMode).annotate({ description: "Context inheritance mode: none, state, or full" }),
    task_id: Schema.optional(Schema.String).annotate({ description: "MiMo task-tree id; accepted for compatibility" }),
    output_schema: Schema.optional(OutputSchema).annotate({ description: "JSON schema requested for subagent output" }),
  })
}

const StatusOperation = Schema.Struct({
  action: Schema.Literal("status"),
  actor_id: Schema.String.annotate({ description: "Actor id returned by run or spawn" }),
})

const WaitOperation = Schema.Struct({
  action: Schema.Literal("wait"),
  actor_id: Schema.String.annotate({ description: "Actor id returned by spawn" }),
  timeout_ms: Schema.optional(Schema.Int).annotate({ description: "Milliseconds to wait before returning timeout" }),
})

const CancelOperation = Schema.Struct({
  action: Schema.Literal("cancel"),
  actor_id: Schema.String.annotate({ description: "Actor id returned by run or spawn" }),
})

const SendOperation = Schema.Struct({
  action: Schema.Literal("send"),
  to_actor_id: Schema.String.annotate({ description: "Target actor id" }),
  content: Schema.String.annotate({ description: "Message content" }),
  to_session_id: Schema.optional(Schema.String).annotate({ description: "Optional target session id" }),
  type: Schema.optional(Schema.String).annotate({ description: "Optional message type" }),
})

function operation(subagentType: SubagentTypeSchema) {
  return Schema.Union([
    runOperation(subagentType),
    spawnOperation(subagentType),
    StatusOperation,
    WaitOperation,
    CancelOperation,
    SendOperation,
  ]).annotate({ discriminator: "action" })
}

function parameters(subagentType: SubagentTypeSchema) {
  return Schema.Struct({
    operation: operation(subagentType),
  })
}

const Operation = operation(SubagentType)
export const Parameters = parameters(SubagentType)

type Parameters = Schema.Schema.Type<typeof Parameters>
type Operation = Schema.Schema.Type<typeof Operation>
type ActorShellArgs = Parameters

const KNOWN_ACTOR_VERBS = ["run", "spawn", "status", "wait", "cancel", "send"]

function levenshteinActor(a: string, b: string): number {
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

function suggestActorVerb(input: string): string | undefined {
  const candidates = KNOWN_ACTOR_VERBS.map((verb) => ({ verb, distance: levenshteinActor(input, verb) })).filter(
    (candidate) => candidate.distance <= 2,
  )
  if (candidates.length !== 1) return undefined
  return candidates[0].verb
}

function actorArityError(verb: string, expected: string, args: string[], line: number) {
  return Effect.fail({
    kind: "arity" as const,
    line,
    detail: `actor: ${verb}: arity mismatch\n  got:      actor ${verb} ${args.join(" ")}\n  expected: actor ${verb} ${expected}`,
  })
}

function extractNamedFlags(
  args: string[],
  names: string[],
  line: number,
): Effect.Effect<{ flags: Record<string, string>; rest: string[] }, { kind: "flag"; line: number; detail: string }> {
  const rest: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const bare = names.find((name) => arg === `--${name}`)
    if (bare) {
      const next = args[i + 1]
      if (next === undefined) {
        return Effect.fail({ kind: "flag" as const, line, detail: `actor: --${bare} requires a value` })
      }
      flags[bare] = next
      i++
      continue
    }
    const eq = names.find((name) => arg.startsWith(`--${name}=`))
    if (eq) {
      const value = arg.slice(`--${eq}=`.length)
      if (value === "") {
        return Effect.fail({ kind: "flag" as const, line, detail: `actor: --${eq} requires a value` })
      }
      flags[eq] = value
      continue
    }
    rest.push(arg)
  }
  return Effect.succeed({ flags, rest })
}

const mapActorVerb = Effect.fn("ActorTool.mapActorVerb")(function* (
  verb: string | undefined,
  args: string[],
  line: number,
) {
  switch (verb) {
    case "run": {
      const { flags, rest } = yield* extractNamedFlags(
        args,
        ["model", "task", "actor", "timeout", "command", "context", "output-schema"],
        line,
      )
      if (rest.length !== 3) {
        return yield* actorArityError(
          "run",
          '<subagent_type> "<description>" "<prompt>" [--model <ref>] [--task <TID>] [--actor <id>] [--timeout <ms>] [--command <cmd>] [--context none|state|full] [--output-schema <json>]',
          rest,
          line,
        )
      }
      return {
        operation: {
          action: "run" as const,
          subagent_type: rest[0],
          description: rest[1],
          prompt: rest[2],
          ...(flags.model ? { model: flags.model } : {}),
          ...(flags.task ? { task_id: flags.task } : {}),
          ...(flags.actor ? { actor_id: flags.actor } : {}),
          ...(flags.timeout ? { timeout_ms: Number(flags.timeout) } : {}),
          ...(flags.command ? { command: flags.command } : {}),
          ...(flags.context ? { context: flags.context } : {}),
          ...(flags["output-schema"] ? { output_schema: JSON.parse(flags["output-schema"]) } : {}),
        },
      } as ActorShellArgs
    }
    case "spawn": {
      const { flags, rest } = yield* extractNamedFlags(
        args,
        ["model", "task", "actor", "command", "context", "output-schema"],
        line,
      )
      if (rest.length !== 3) {
        return yield* actorArityError(
          "spawn",
          '<subagent_type> "<description>" "<prompt>" [--model <ref>] [--task <TID>] [--actor <id>] [--command <cmd>] [--context none|state|full] [--output-schema <json>]',
          rest,
          line,
        )
      }
      return {
        operation: {
          action: "spawn" as const,
          subagent_type: rest[0],
          description: rest[1],
          prompt: rest[2],
          ...(flags.model ? { model: flags.model } : {}),
          ...(flags.task ? { task_id: flags.task } : {}),
          ...(flags.actor ? { actor_id: flags.actor } : {}),
          ...(flags.command ? { command: flags.command } : {}),
          ...(flags.context ? { context: flags.context } : {}),
          ...(flags["output-schema"] ? { output_schema: JSON.parse(flags["output-schema"]) } : {}),
        },
      } as ActorShellArgs
    }
    case "status":
      if (args.length !== 1) return yield* actorArityError("status", "<actor_id>", args, line)
      return { operation: { action: "status" as const, actor_id: args[0] } } as ActorShellArgs
    case "wait": {
      const { flags, rest } = yield* extractNamedFlags(args, ["timeout"], line)
      if (rest.length !== 1) return yield* actorArityError("wait", "<actor_id> [--timeout <ms>]", rest, line)
      return {
        operation: {
          action: "wait" as const,
          actor_id: rest[0],
          ...(flags.timeout ? { timeout_ms: Number(flags.timeout) } : {}),
        },
      } as ActorShellArgs
    }
    case "cancel":
      if (args.length !== 1) return yield* actorArityError("cancel", "<actor_id>", args, line)
      return { operation: { action: "cancel" as const, actor_id: args[0] } } as ActorShellArgs
    case "send": {
      const { flags, rest } = yield* extractNamedFlags(args, ["session", "type"], line)
      if (rest.length !== 2) {
        return yield* actorArityError("send", '<to_actor_id> "<content>" [--session <id>] [--type <t>]', rest, line)
      }
      return {
        operation: {
          action: "send" as const,
          to_actor_id: rest[0],
          content: rest[1],
          ...(flags.session ? { to_session_id: flags.session } : {}),
          ...(flags.type ? { type: flags.type } : {}),
        },
      } as ActorShellArgs
    }
    default: {
      const suggestion = suggestActorVerb(verb ?? "")
      const detail =
        `actor: unknown verb "${verb ?? ""}"\n` +
        `  available verbs: ${KNOWN_ACTOR_VERBS.join(", ")}` +
        (suggestion ? `\n  did you mean: ${suggestion}?` : "")
      return yield* Effect.fail({ kind: "unknown-verb" as const, line, detail })
    }
  }
})

export function parseActorScript(script: string): Effect.Effect<ActorShellArgs[], unknown> {
  return Effect.gen(function* () {
    const argvList = yield* tokenize(script)
    const out: ActorShellArgs[] = []
    for (const argv of argvList) {
      const [head, verb, ...rest] = argv.tokens
      if (head !== "actor") {
        return yield* Effect.fail({
          kind: "unknown-verb" as const,
          line: argv.line,
          detail: `actor: every command must start with 'actor' (got '${head ?? ""}')`,
        })
      }
      out.push(yield* mapActorVerb(verb, rest, argv.line))
    }
    return out
  })
}

function inferAction(input: Record<string, unknown>): "run" | "spawn" {
  if (input.action === "spawn" || input.action === "run") return input.action
  if (input.background === true || input.async === true) return "spawn"
  return "run"
}

export function recoverActorArgs(rawArgs: unknown): ActorShellArgs | undefined {
  if (rawArgs == null || typeof rawArgs !== "object") return undefined
  let obj = rawArgs as Record<string, unknown>
  if (typeof obj.operation === "string") {
    try {
      const inner = JSON.parse(obj.operation)
      if (inner && typeof inner === "object" && !Array.isArray(inner)) obj = { operation: inner }
    } catch {}
  }
  if (obj.operation && typeof obj.operation === "object" && !Array.isArray(obj.operation)) {
    return { operation: obj.operation } as ActorShellArgs
  }
  const subagentType = obj.subagent_type
  const description = obj.description
  const prompt = obj.prompt
  if (typeof subagentType === "string" && typeof description === "string" && typeof prompt === "string") {
    const op: Record<string, unknown> = {
      action: inferAction(obj),
      subagent_type: subagentType,
      description,
      prompt,
    }
    if (typeof obj.model === "string") op.model = obj.model
    if (typeof obj.task_id === "string") op.task_id = obj.task_id
    if (typeof obj.actor_id === "string") op.actor_id = obj.actor_id
    return { operation: op } as ActorShellArgs
  }
  return undefined
}

function subagentTypeSchema(agents: Agent.Info[]) {
  const names = agents.filter((agent) => agent.mode === "subagent" && agent.hidden !== true).map((agent) => agent.name)
  if (names.length === 0) return SubagentType
  return Schema.Literals(names as [string, ...string[]]).annotate({
    description: "The type of specialized agent to use for this task",
  }) as unknown as SubagentTypeSchema
}

function summaryAttribute(summary: string | undefined) {
  if (!summary) return ""
  return ` summary="${summary.replace(/\s+/g, " ").replace(/"/g, "'").trim()}"`
}

function renderActorResult(actorID: string, output: string, status = "unknown") {
  const reported = parseReturnHeader(output)
  const statusAttr = reported.status ?? status
  return [
    `actor_id: ${actorID} (for status/wait/cancel)`,
    "",
    `<actor_result status="${statusAttr}"${summaryAttribute(reported.summary)}>`,
    output,
    "</actor_result>",
  ].join("\n")
}

function json(input: unknown) {
  return JSON.stringify(input)
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function compatibilityNotice(op: Extract<Operation, { action: "run" | "spawn" }>) {
  const notes: string[] = []
  if (op.model) notes.push(`model override "${op.model}" is forwarded to the target SWUST subagent`)
  if (op.task_id) notes.push(`task_id "${op.task_id}" is bound to the MiMo-compatible SWUST task tree when present`)
  if (op.output_schema) notes.push("output_schema is forwarded to the target SWUST subagent as structured output")
  if (!notes.length) return ""
  return ["<actor_compatibility>", ...notes.map((item) => `- ${item}`), "</actor_compatibility>", ""].join("\n")
}

function withSessionStatePrompt(checkpoint: string, prompt: string) {
  return [
    "<session-state>",
    "Here is a summary of the parent session's progress:",
    "",
    checkpoint,
    "</session-state>",
    "",
    prompt,
  ].join("\n")
}

function parseModel(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const separator = model.indexOf("/")
  if (separator <= 0 || separator === model.length - 1) return undefined
  return {
    providerID: ProviderV2.ID.make(model.slice(0, separator)),
    modelID: ModelV2.ID.make(model.slice(separator + 1)),
  }
}

export const ActorTool = Tool.define(
  id,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const registry = yield* ActorRegistry.Service
    const taskRegistry = yield* TaskRegistry.Service
    const agents = yield* Agent.Service
    const checkpoint = yield* SessionCheckpoint.Service

    const actors = new Map<string, ActorRunState>()

    const unknown = (label: string, actorID: string) => ({
      title: `Actor ${label}: unknown`,
      output: json({ status: "unknown", actor_id: actorID }),
      metadata: { actor_id: actorID, status: "unknown" },
    })

    const getOrAllocateActorID = Effect.fn("ActorTool.getOrAllocateActorID")(function* (
      sessionID: string,
      agentType: string,
      requested?: string,
    ) {
      if (requested) return requested
      return yield* registry.allocateActorID(sessionID, agentType)
    })

    const requireActor = () => {
      const actor = spawnRef.current
      if (!actor) {
        return Effect.fail(
          new Error("Actor service unavailable; ActorSpawn.defaultLayer must be running for the actor tool"),
        )
      }
      return Effect.succeed(actor)
    }

    return Effect.fn("ActorTool.init")(function* () {
      const params = parameters(subagentTypeSchema(yield* agents.list()))

      const findActor = Effect.fn("ActorTool.findActor")(function* (sessionID: string, actorID: string) {
        const child = yield* registry.get(sessionID, actorID)
        if (child) return { entry: child, sessionID }
        const peerSessionID = SessionID.make(actorID)
        const peer = yield* registry.get(peerSessionID, actorID)
        if (peer) return { entry: peer, sessionID: peerSessionID }
        return undefined
      })

      const actorSnapshot = (
        entry: ActorRegistry.Actor,
        extra: { status?: string; result?: string; error?: string } = {},
      ) => {
        const result = extra.result
        const reported = parseReturnHeader(result)
        return {
          status: extra.status ?? entry.status,
          actor_id: entry.actorID,
          description: entry.description,
          agent: entry.agent,
          background: entry.background,
          turnCount: entry.turnCount,
          lastTurnTime: entry.lastTurnTime,
          lastOutcome: entry.lastOutcome,
          ...(extra.result !== undefined ? { result: extra.result } : {}),
          ...(extra.error ?? entry.lastError ? { error: extra.error ?? entry.lastError } : {}),
          ...(reported.status ? { reportedStatus: reported.status } : {}),
          ...(reported.summary ? { reportedSummary: reported.summary } : {}),
          time: {
            created: entry.timeCreated,
            updated: entry.lastTurnTime,
            ...(entry.timeCompleted ? { completed: entry.timeCompleted } : {}),
          },
          timeCreated: entry.timeCreated,
          timeCompleted: entry.timeCompleted,
        }
      }

      const resolveTaskBinding = Effect.fn("ActorTool.resolveTaskBinding")(function* (
        sessionID: SessionID,
        taskID: string | undefined,
      ) {
        if (!taskID) return {}
        const valid = Result.isSuccess(Schema.decodeUnknownResult(TaskID)(taskID))
        if (!valid) {
          return {
            notice: `note: task_id "${taskID}" is not a valid task ID (expected Tn or Tn.m); ran ad-hoc. Task IDs come from the \`task\` tool.`,
          }
        }
        const existing = yield* taskRegistry.get({ session_id: sessionID, id: taskID })
        if (!existing) {
          return {
            notice: `note: task_id "${taskID}" does not exist in this session; ran ad-hoc. Create it with the \`task\` tool first, or omit task_id.`,
          }
        }
        return { taskID }
      })

      const runTask = Effect.fn("ActorTool.runTask")(function* (
        actorID: string,
        op: Extract<Operation, { action: "run" | "spawn" }>,
        ctx: Tool.Context,
        runInBackground: boolean,
        taskBinding: TaskBinding,
      ) {
        const latestCheckpoint =
          op.context === "state"
            ? yield* checkpoint.loadLatest(ctx.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
            : undefined
        const task = latestCheckpoint ? withSessionStatePrompt(latestCheckpoint, op.prompt) : op.prompt
        const prompt = [compatibilityNotice(op), task].filter(Boolean).join("\n")
        const actor = yield* requireActor()
        const spawn = yield* actor.spawn({
          mode: "subagent",
          sessionID: ctx.sessionID,
          actorID,
          agentType: op.subagent_type,
          task: prompt,
          description: op.description,
          background: runInBackground,
          lifecycle: "ephemeral",
          model: parseModel(op.model),
          task_id: taskBinding.taskID,
          ...(op.output_schema ? { format: { type: "json_schema" as const, schema: op.output_schema } } : {}),
        })
        const outcome = yield* Deferred.await(spawn.outcome)

        if (outcome.status === "failure") {
          actors.set(actorID, {
            actorID,
            description: op.description,
            agent: op.subagent_type,
            error: outcome.error,
            background: runInBackground,
          })
          return yield* Effect.fail(new Error(outcome.error ?? "Actor failed"))
        }
        if (outcome.status === "cancelled") return yield* Effect.fail(new Error("Actor cancelled"))

        const output = outcome.finalText ?? ""
        actors.set(actorID, {
          actorID,
          description: op.description,
          agent: op.subagent_type,
          result: output,
          background: runInBackground,
        })
        return {
          title: op.description,
          metadata: { sessionId: spawn.sessionID, actorId: spawn.actorID, subagent_type: op.subagent_type },
          output,
        }
      })

      const startActor = Effect.fn("ActorTool.startActor")(function* (
        op: Extract<Operation, { action: "run" | "spawn" }>,
        ctx: Tool.Context,
      ) {
        if (!ctx.extra?.bypassAgentCheck) {
          yield* ctx.ask({
            permission: id,
            patterns: [op.subagent_type],
            always: ["*"],
            metadata: {
              description: op.description,
              subagent_type: op.subagent_type,
            },
          })
        }

        const actorID = yield* getOrAllocateActorID(ctx.sessionID, op.subagent_type, op.actor_id)
        const taskBinding = yield* resolveTaskBinding(ctx.sessionID, op.task_id)
        const existing = actors.get(actorID)
        actors.set(actorID, {
          actorID,
          description: op.description,
          agent: op.subagent_type,
          background: op.action === "spawn",
          result: existing?.result,
          error: existing?.error,
        })

        const run = runTask(actorID, op, ctx, op.action === "spawn", taskBinding).pipe(
          Effect.map((result) =>
            [taskBinding.notice, renderActorResult(actorID, result.output)].filter(Boolean).join("\n"),
          ),
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              const message = errorText(Cause.squash(cause))
              actors.set(actorID, {
                actorID,
                description: op.description,
                agent: op.subagent_type,
                error: message,
                background: op.action === "spawn",
              })
              yield* registry.updateStatus(ctx.sessionID, actorID, "idle", "failure", message)
              if (taskBinding.taskID) {
                yield* taskRegistry
                  .block({
                    session_id: ctx.sessionID,
                    id: taskBinding.taskID,
                    event_summary: `actor ${actorID} failed: ${message}`,
                  })
                  .pipe(Effect.ignore)
              }
              return yield* Effect.failCause(cause)
            }),
          ),
        )
        const info = yield* background.start({
          id: actorID,
          type: id,
          title: op.description,
          metadata: { actor_id: actorID, subagent_type: op.subagent_type, description: op.description },
          run,
        })

        if (op.action === "spawn") {
          yield* ctx.metadata({
            title: op.description,
            metadata: { actorId: actorID, jobId: info.id, subagent_type: op.subagent_type, background: true },
          })
          return {
            title: op.description,
            metadata: { actorId: actorID, jobId: info.id, subagent_type: op.subagent_type, background: true },
            output: [
              taskBinding.notice,
              `Background actor started. actor_id: ${actorID}`,
              "Use actor wait/status/cancel with this actor_id.",
            ]
              .filter(Boolean)
              .join("\n"),
          }
        }

        const waited = yield* background.wait({ id: actorID, timeout: op.timeout_ms ?? 600_000 })
        if (waited.timedOut) {
          yield* ctx.metadata({
            title: op.description,
            metadata: {
              actorId: actorID,
              jobId: info.id,
              subagent_type: op.subagent_type,
              status: "timeout",
            },
          })
          return {
            title: op.description,
            metadata: {
              actorId: actorID,
              jobId: info.id,
              subagent_type: op.subagent_type,
              status: "timeout",
            },
            output: [taskBinding.notice, renderActorResult(actorID, "<timeout>task did not complete within timeout</timeout>", "timeout")]
              .filter(Boolean)
              .join("\n"),
          }
        }

        if (waited.info?.status === "error") {
          return yield* Effect.fail(new Error(`Tool execution failed: ${waited.info.error ?? "unknown"}`))
        }
        if (waited.info?.status === "cancelled") {
          return yield* Effect.fail(new Error("Actor cancelled"))
        }

        const state = actors.get(actorID)
        const metadata = {
          actorId: actorID,
          jobId: info.id,
          subagent_type: op.subagent_type,
          sessionId: ctx.sessionID,
        }
        yield* ctx.metadata({
          title: op.description,
          metadata,
        })
        return {
          title: op.description,
          metadata,
          output: waited.info?.output ?? renderActorResult(actorID, "(no output)"),
        }
      })

      const execute = Effect.fn("ActorTool.execute")(function* (params: Parameters, ctx: Tool.Context) {
        const op = params.operation

        if (op.action === "run" || op.action === "spawn") return yield* startActor(op, ctx)

        if (op.action === "status") {
          const found = yield* findActor(ctx.sessionID, op.actor_id)
          if (!found) return unknown("status", op.actor_id)
          const entry = found.entry
          return {
            title: `Actor status: ${entry.status}`,
            output: json(actorSnapshot(entry, { result: actors.get(op.actor_id)?.result })),
            metadata: { actor_id: entry.actorID, status: entry.status } as Record<string, unknown>,
          }
        }

        if (op.action === "wait") {
          const found = yield* findActor(ctx.sessionID, op.actor_id)
          if (!found) return unknown("wait", op.actor_id)
          const existingJob = yield* background.get(op.actor_id)
          const state = actors.get(op.actor_id)
          if (!existingJob && (found.entry.status === "idle" || found.entry.status === "failed" || found.entry.status === "cancelled")) {
            const status = found.entry.status
            return {
              title: `Actor wait: ${status}${found.entry.lastOutcome ? "/" + found.entry.lastOutcome : ""}`,
              output: json(actorSnapshot(found.entry, { result: state?.result, error: state?.error })),
              metadata: {
                actor_id: op.actor_id,
                status,
                ...(found.entry.lastOutcome ? { lastOutcome: found.entry.lastOutcome } : {}),
              } as Record<string, unknown>,
            }
          }
          const waited = yield* background.wait({ id: op.actor_id, timeout: op.timeout_ms ?? 600_000 })
          if (waited.timedOut) {
            return {
              title: "Actor wait: timeout",
              output: json({ status: "timeout", actor_id: op.actor_id }),
              metadata: { actor_id: op.actor_id, status: "timeout" } as Record<string, unknown>,
            }
          }
          const fresh = (yield* registry.get(found.sessionID, op.actor_id)) ?? found.entry
          const status = fresh.status
          return {
            title: `Actor wait: ${status}${fresh.lastOutcome ? "/" + fresh.lastOutcome : ""}`,
            output: json(actorSnapshot(fresh, { result: waited.info?.output ?? state?.result, error: waited.info?.error ?? state?.error })),
            metadata: {
              actor_id: op.actor_id,
              status,
              ...(fresh.lastOutcome ? { lastOutcome: fresh.lastOutcome } : {}),
            } as Record<string, unknown>,
          }
        }

        if (op.action === "cancel") {
          const found = yield* findActor(ctx.sessionID, op.actor_id)
          if (!found) return unknown("cancel", op.actor_id)
          if (found.entry.status === "idle" || found.entry.status === "failed" || found.entry.status === "cancelled") {
            return {
              title: `Actor cancel: ${found.entry.status}`,
              output: json(actorSnapshot(found.entry, { result: actors.get(op.actor_id)?.result })),
              metadata: { actor_id: found.entry.actorID, status: found.entry.status } as Record<string, unknown>,
            }
          }
          const actor = spawnRef.current
          if (actor) yield* actor.cancel(found.sessionID, op.actor_id).pipe(Effect.ignore)
          yield* background.cancel(op.actor_id).pipe(Effect.ignore)
          yield* registry.updateStatus(found.sessionID, op.actor_id, "idle", "cancelled")
          return {
            title: "Actor cancel: cancelled",
            output: json({ status: "cancelled", actor_id: op.actor_id }),
            metadata: { actor_id: op.actor_id, status: "cancelled" } as Record<string, unknown>,
          }
        }

        const inbox = inboxServiceRef.current
        if (!inbox) {
          return yield* Effect.fail(new Error("Inbox service unavailable; Inbox.defaultLayer must be running"))
        }
        const receiverSessionID = op.to_session_id ? SessionID.make(op.to_session_id) : ctx.sessionID
        const result = yield* inbox
          .send({
            receiverSessionID,
            receiverActorID: op.to_actor_id,
            senderSessionID: ctx.sessionID,
            senderActorID: ctx.agent ?? "main",
            content: op.content,
            ...(op.type ? { type: op.type } : {}),
          })
          .pipe(
            Effect.catchTag("InboxReceiverNotFound", () =>
              Effect.succeed({ inboxID: null as string | null, error: "receiver not found" }),
            ),
          )

        if ("error" in result) {
          return {
            title: "Send failed: receiver not found",
            output: json(result),
            metadata: {
              receiver_actor_id: op.to_actor_id,
              receiver_session_id: receiverSessionID,
              error: result.error,
            } as Record<string, unknown>,
          }
        }

        return {
          title: `Sent to ${op.to_actor_id}`,
          output: json({ inboxID: result.inboxID }),
          metadata: {
            inboxID: result.inboxID,
            receiver_actor_id: op.to_actor_id,
            receiver_session_id: receiverSessionID,
          } as Record<string, unknown>,
        }
      })

      return {
        description: DESCRIPTION,
        parameters: params,
        jsonSchema: ToolJsonSchema.fromSchema(params),
        execute: (params: Parameters, ctx: Tool.Context) => execute(params, ctx).pipe(Effect.orDie),
        shell: {
          description: SHELL_DESCRIPTION,
          parse: parseActorScript,
          recover: recoverActorArgs,
        },
      }
    })
  }),
)
