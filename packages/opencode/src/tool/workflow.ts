import fs from "fs/promises"
import path from "path"
import * as Tool from "./tool"
import DESCRIPTION from "./workflow.txt"
import { ToolJsonSchema } from "./json-schema"
import { Global } from "@swust-code/core/global"
import { getBuiltinWorkflow } from "@/workflow/builtin"
import { Workflow, type WorkflowRun } from "@/workflow/runtime"
import type { SessionID } from "@/session/schema"
import { Effect, Schema } from "effect"

const id = "workflow"
const DEFAULT_WAIT_TIMEOUT_MS = 30_000
const POLL_MS = 100

const RunOperation = Schema.Struct({
  operation: Schema.Literal("run"),
  name: Schema.optional(Schema.String).annotate({
    description:
      '(optional) Name of a built-in workflow to run, for example "deep-research". Provide either name or script, not both.',
  }),
  script: Schema.optional(Schema.String).annotate({
    description:
      "(optional) Inline JS workflow script; must begin with `export const meta = {...}`. Provide either name or script, not both.",
  }),
  args: Schema.optional(Schema.Unknown).annotate({
    description: "(optional) JSON value exposed to the script as `args`.",
  }),
})

const StatusOperation = Schema.Struct({
  operation: Schema.Literal("status"),
  run_id: Schema.String.annotate({ description: "Workflow run id." }),
})

const WaitOperation = Schema.Struct({
  operation: Schema.Literal("wait"),
  run_id: Schema.String.annotate({ description: "Workflow run id." }),
  timeout_ms: Schema.optional(Schema.Number).annotate({
    description: "Maximum time to wait in milliseconds. Default: 30000.",
  }),
})

const CancelOperation = Schema.Struct({
  operation: Schema.Literal("cancel"),
  run_id: Schema.String.annotate({ description: "Workflow run id." }),
})

const ResumeOperation = Schema.Struct({
  operation: Schema.Literal("resume"),
  run_id: Schema.String.annotate({ description: "Workflow run id." }),
})

export const Parameters = Schema.Union([
  RunOperation,
  StatusOperation,
  WaitOperation,
  CancelOperation,
  ResumeOperation,
]).annotate({ discriminator: "operation" })

type Parameters = Schema.Schema.Type<typeof Parameters>
type Metadata = { runID?: string; status?: string }

function isTerminal(run: WorkflowRun) {
  return run.status === "completed" || run.status === "failed" || run.status === "cancelled"
}

function renderRun(run: WorkflowRun) {
  return JSON.stringify(run, null, 2)
}

function persistedScriptPath(runID: string) {
  if (path.basename(runID) !== runID || runID.includes("..")) {
    throw new Error(`Invalid workflow run_id: ${runID}`)
  }
  return path.join(Global.Path.data, "workflow", `${runID}.js`)
}

export const WorkflowTool = Tool.define<typeof Parameters, Metadata, Workflow.Service>(
  id,
  Effect.gen(function* () {
    const workflow = yield* Workflow.Service

    const waitForRun = Effect.fn("WorkflowTool.waitForRun")(function* (runID: string, timeoutMs?: number) {
      const deadline = Date.now() + Math.max(1, timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
      let last: WorkflowRun | undefined
      while (Date.now() <= deadline) {
        const current = yield* workflow.getStatus(runID)
        if (!current) return yield* Effect.fail(new Error(`Workflow not found: ${runID}`))
        last = current
        if (isTerminal(current)) return current
        yield* Effect.sleep(`${POLL_MS} millis`)
      }
      return last ?? (yield* Effect.fail(new Error(`Workflow not found: ${runID}`)))
    })

    const run = Effect.fn("WorkflowTool.execute")(function* (input: Parameters, ctx: Tool.Context<Metadata>) {
      if (input.operation === "run") {
        if (input.name && input.script) {
          return yield* Effect.fail(new Error("workflow run: provide either `name` or `script`, not both."))
        }
        const script = input.name ? getBuiltinWorkflow(input.name)?.script : input.script
        if (!script) {
          const suffix = input.name ? `Unknown built-in workflow "${input.name}".` : "Missing workflow name or script."
          return yield* Effect.fail(new Error(`${suffix} Use operation "run" with either name or script.`))
        }
        const started = yield* workflow.start({
          script,
          sessionID: ctx.sessionID as SessionID,
          args: input.args,
        })
        return {
          title: "workflow started",
          output: `Workflow started. run_id: ${started.runID}\nUse workflow status or wait to inspect progress.`,
          metadata: { runID: started.runID, status: started.status },
        }
      }

      if (input.operation === "status") {
        const snapshot = yield* workflow.getStatus(input.run_id)
        if (!snapshot) return yield* Effect.fail(new Error(`Workflow not found: ${input.run_id}`))
        return {
          title: `workflow ${snapshot.status}`,
          output: renderRun(snapshot),
          metadata: { runID: input.run_id, status: snapshot.status },
        }
      }

      if (input.operation === "wait") {
        const snapshot = yield* waitForRun(input.run_id, input.timeout_ms)
        return {
          title: `workflow ${snapshot.status}`,
          output: renderRun(snapshot),
          metadata: { runID: input.run_id, status: snapshot.status },
        }
      }

      if (input.operation === "cancel") {
        yield* workflow.cancel(input.run_id)
        return {
          title: "workflow cancelled",
          output: `Cancelled ${input.run_id}`,
          metadata: { runID: input.run_id, status: "cancelled" },
        }
      }

      if (input.operation === "resume") {
        const script = yield* Effect.tryPromise({
          try: () => fs.readFile(persistedScriptPath(input.run_id), "utf8"),
          catch: () => new Error(`Workflow ${input.run_id} is not resumable because its script was not found.`),
        })
        const resumed = yield* workflow.start({
          script,
          sessionID: ctx.sessionID as SessionID,
          resumeRunID: input.run_id,
        })
        return {
          title: "workflow resumed",
          output: renderRun(resumed),
          metadata: { runID: resumed.runID, status: resumed.status },
        }
      }

      input satisfies never
      throw new Error(`Unhandled workflow operation: ${(input as { operation: string }).operation}`)
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      jsonSchema: ToolJsonSchema.fromSchema(Parameters),
      execute: (input: Parameters, ctx: Tool.Context<Metadata>) => run(input, ctx).pipe(Effect.orDie),
    }
  }),
)
