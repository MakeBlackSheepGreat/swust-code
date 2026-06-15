/**
 * Workflow Runtime - scriptable multi-agent orchestration.
 *
 * Workflows are JavaScript scripts that run with explicit host functions:
 * agent, parallel, pipeline, phase, log, workflow, and args.
 *
 * This implementation executes scripts through a restricted host-function
 * runner and journals every phase/log/agent result for inspection and resume.
 * A QuickJS backend can replace the compile/execute boundary without changing
 * the workflow service contract.
 */

import { Global } from "@swust-code/core/global"
import { Context, Deferred, Effect, Layer } from "effect"
import { spawnRef } from "@/actor/spawn-ref"
import { EffectBridge } from "@/effect/bridge"
import { getBuiltinWorkflow } from "./builtin"
import {
  computeAgentKey,
  WorkflowJournal as PersistentWorkflowJournal,
  type JournalState,
} from "./persistence"

const SCRIPT_DEADLINE_MS = 12 * 60 * 60 * 1000
const MAX_LIFECYCLE_AGENTS = 1000
const DEFAULT_MAX_CONCURRENT = 16
const MAX_WORKFLOW_DEPTH = 8
const WORKFLOW_STRUCTURAL_ERROR = "WorkflowStructuralError"

type WorkflowAgentOptions = {
  readonly label?: string
  readonly phase?: string
  readonly model?: string
  readonly agentType?: string
  readonly schema?: unknown
}

type WorkflowHost = WorkflowHostFns & {
  readonly args: unknown
}

type AsyncWorkflowFunction = (
  host: WorkflowHost,
  process?: never,
  require?: never,
  module?: never,
  exports?: never,
  Bun?: never,
  Deno?: never,
  global?: never,
  globalThis?: never,
  window?: never,
  document?: never,
  fetch?: never,
  WebSocket?: never,
  XMLHttpRequest?: never,
  Function?: never,
) => Promise<unknown>

export type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface WorkflowRun {
  readonly runID: string
  readonly sessionID: string
  readonly status: WorkflowStatus
  readonly name?: string
  readonly agentCount: number
  readonly runningCount: number
  readonly succeededCount: number
  readonly failedCount: number
  readonly currentPhase?: string
  readonly startTime: number
  readonly endTime?: number
}

export interface WorkflowStartInput {
  readonly script: string
  readonly sessionID: string
  readonly args?: unknown
  readonly resumeRunID?: string
  readonly maxConcurrentAgents?: number
  readonly maxLifecycleAgents?: number
  readonly agentTimeoutMs?: number
  readonly scriptDeadlineMs?: number
}

export interface WorkflowMeta {
  readonly name: string
  readonly description: string
  readonly phases?: ReadonlyArray<{ readonly title: string; readonly detail?: string }>
}

export interface AgentResult {
  readonly label?: string
  readonly text: string
  readonly phase?: string
  readonly actorID?: string
}

export interface JournalEntry {
  readonly timestamp: number
  readonly type: "phase" | "agent_start" | "agent_complete" | "agent_fail" | "log" | "error"
  readonly data: unknown
}

export function parseMeta(script: string): WorkflowMeta | null {
  const object = extractMetaObject(script)
  if (!object) return null
  try {
    const json = object
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, "$1")
    return JSON.parse(json) as WorkflowMeta
  } catch {
    return null
  }
}

export class WorkflowJournal {
  private entries: JournalEntry[] = []

  constructor(readonly runID: string) {}

  append(entry: Omit<JournalEntry, "timestamp">): JournalEntry {
    const full = { ...entry, timestamp: Date.now() }
    this.entries.push(full)
    return full
  }

  getEntries(): ReadonlyArray<JournalEntry> {
    return [...this.entries]
  }

  getLastPhase(): string | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]
      if (entry?.type === "phase") return (entry.data as { title?: string }).title
    }
    return undefined
  }
}

export interface WorkflowHostFns {
  readonly agent: (prompt: string, opts?: WorkflowAgentOptions) => Promise<AgentResult>
  readonly parallel: <T>(thunks: ReadonlyArray<() => Promise<T>>) => Promise<T[]>
  readonly pipeline: <T>(items: ReadonlyArray<T>, ...stages: Array<(item: T, index: number) => Promise<T>>) => Promise<T[]>
  readonly phase: (title: string) => void
  readonly log: (message: string) => void
  readonly workflow: (name: string, args?: unknown) => Promise<unknown>
}

export interface Interface {
  readonly start: (input: WorkflowStartInput) => Effect.Effect<WorkflowRun>
  readonly getStatus: (runID: string) => Effect.Effect<WorkflowRun | undefined>
  readonly cancel: (runID: string) => Effect.Effect<void>
  readonly getJournal: (runID: string) => Effect.Effect<ReadonlyArray<JournalEntry>>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Workflow") {}

class WorkflowCancelledError extends Error {
  constructor() {
    super("Workflow was cancelled")
    this.name = "WorkflowCancelledError"
  }
}

class WorkflowExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = WORKFLOW_STRUCTURAL_ERROR
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const runs = new Map<string, WorkflowRun>()
    const journals = new Map<string, { memory: WorkflowJournal; disk: PersistentWorkflowJournal }>()
    const controllers = new Map<string, AbortController>()
    let runCounter = 0

    const patchRun = (runID: string, update: (run: WorkflowRun) => WorkflowRun) => {
      const current = runs.get(runID)
      if (!current) return
      runs.set(runID, update(current))
    }

    const append = (runID: string, entry: Omit<JournalEntry, "timestamp">) => {
      const journal = journals.get(runID)
      if (!journal) return
      const full = journal.memory.append(entry)
      switch (full.type) {
        case "phase":
          journal.disk.append({ t: "phase", title: (full.data as { title?: string }).title })
          break
        case "log":
          journal.disk.append({ t: "log", msg: (full.data as { message?: string }).message ?? String(full.data) })
          break
        case "error":
        case "agent_fail":
          journal.disk.append({ t: "error", msg: stringifyError(full.data) })
          break
        case "agent_complete": {
          const data = full.data as { key?: string; result?: unknown }
          if (data.key) journal.disk.append({ t: "agent", key: data.key, result: data.result })
          break
        }
      }
    }

    const executeRun = async (
      input: WorkflowStartInput,
      runID: string,
      controller: AbortController,
      state: JournalState,
      bridge: EffectBridge.Shape,
    ) => {
      const limit = createLimiter(Math.max(1, Math.min(DEFAULT_MAX_CONCURRENT, input.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT)))
      const agentOccurrences = new Map<string, number>()
      const maxAgents = input.maxLifecycleAgents ?? MAX_LIFECYCLE_AGENTS
      let lifecycleAgents = 0

      const makeHost = (scriptArgs: unknown, depth: number, stack: ReadonlyArray<string>): WorkflowHost => {
        if (depth > MAX_WORKFLOW_DEPTH) {
          throw new WorkflowExecutionError(`Nested workflow depth exceeded ${MAX_WORKFLOW_DEPTH}`)
        }

        const host: WorkflowHost = {
          args: scriptArgs,
          agent: async (prompt, opts = {}) => {
            assertNotCancelled(controller.signal)
            lifecycleAgents++
            if (lifecycleAgents > maxAgents) {
              throw new WorkflowExecutionError(`Workflow exceeded max lifecycle agents: ${maxAgents}`)
            }

            const run = runs.get(runID)
            const phase = opts.phase ?? run?.currentPhase
            const occurrenceBase = `${phase ?? ""}\n${opts.label ?? ""}\n${opts.agentType ?? "default"}\n${opts.model ?? ""}\n${prompt}`
            const occurrence = (agentOccurrences.get(occurrenceBase) ?? 0) + 1
            agentOccurrences.set(occurrenceBase, occurrence)
            const key = computeAgentKey({
              prompt,
              agentType: opts.agentType,
              model: opts.model,
              schema: opts.schema === undefined ? undefined : stableStringify(opts.schema),
              phase,
              occurrence,
            })

            if (state.results.has(key)) {
              return state.results.get(key) as AgentResult
            }

            append(runID, { type: "agent_start", data: { key, label: opts.label, phase, prompt } })
            patchRun(runID, (current) => ({
              ...current,
              agentCount: current.agentCount + 1,
              runningCount: current.runningCount + 1,
            }))

            try {
              const result = await limit.run(() =>
                withDeadline(
                  () => {
                    const actorSpawn = spawnRef.current
                    if (!actorSpawn) {
                      throw new WorkflowExecutionError("Actor spawn service is not available")
                    }
                    return bridge.promise(
                      actorSpawn.spawn({
                        mode: "subagent",
                        sessionID: input.sessionID,
                        agentType: opts.agentType ?? "general",
                        task: prompt,
                        description: opts.label ?? prompt.slice(0, 100),
                        model: parseModel(opts.model),
                        lifecycle: "ephemeral",
                      }),
                    )
                  },
                  input.agentTimeoutMs,
                  controller.signal,
                  "Workflow agent timed out",
                ),
              )

              const outcome = await bridge.promise(Deferred.await(result.outcome))
              const agentResult: AgentResult = {
                label: opts.label,
                phase,
                actorID: result.actorID,
                text: outcome.finalText ?? outcome.error ?? "",
              }
              append(runID, { type: "agent_complete", data: { key, result: agentResult } })
              patchRun(runID, (current) => ({
                ...current,
                runningCount: Math.max(0, current.runningCount - 1),
                succeededCount: current.succeededCount + 1,
              }))
              return agentResult
            } catch (error) {
              append(runID, { type: "agent_fail", data: { key, error: stringifyError(error), phase } })
              patchRun(runID, (current) => ({
                ...current,
                runningCount: Math.max(0, current.runningCount - 1),
                failedCount: current.failedCount + 1,
              }))
              throw error
            }
          },
          parallel: async (thunks) => Promise.all(thunks.map((thunk) => thunk())),
          pipeline: async (items, ...stages) => {
            let current = [...items]
            for (const stage of stages) {
              current = await Promise.all(current.map((item, index) => stage(item, index)))
            }
            return current
          },
          phase: (title) => {
            assertNotCancelled(controller.signal)
            patchRun(runID, (current) => ({ ...current, currentPhase: title }))
            append(runID, { type: "phase", data: { title } })
          },
          log: (message) => {
            assertNotCancelled(controller.signal)
            append(runID, { type: "log", data: { message } })
          },
          workflow: async (name, args) => {
            assertNotCancelled(controller.signal)
            if (stack.includes(name)) {
              throw new WorkflowExecutionError(`Nested workflow cycle detected: ${[...stack, name].join(" -> ")}`)
            }
            const builtin = getBuiltinWorkflow(name)
            if (!builtin) throw new WorkflowExecutionError(`Unknown workflow: ${name}`)
            append(runID, { type: "log", data: { message: `Nested workflow "${name}" started` } })
            return executeScript(builtin.script, makeHost(args, depth + 1, [...stack, name]), controller.signal, input.scriptDeadlineMs)
          },
        }
        return host
      }

      const result = await executeScript(input.script, makeHost(input.args, 0, []), controller.signal, input.scriptDeadlineMs)
      append(runID, { type: "log", data: { message: "Workflow completed", result } })
    }

    const start = (input: WorkflowStartInput): Effect.Effect<WorkflowRun> =>
      Effect.gen(function* () {
        const bridge = yield* EffectBridge.make()
        const runID = input.resumeRunID ?? `wf_${++runCounter}_${Date.now().toString(36)}`
        const meta = parseMeta(input.script)
        const controller = new AbortController()
        const disk = new PersistentWorkflowJournal(Global.Path.data, runID)
        const validScript = disk.validateScript(input.script)
        if (!validScript) disk.saveScript(input.script)
        const state = disk.load()
        const memory = new WorkflowJournal(runID)

        const currentPhase = disk.getLastPhase() ?? meta?.phases?.[0]?.title
        const run: WorkflowRun = {
          runID,
          sessionID: input.sessionID,
          status: "running",
          name: meta?.name,
          agentCount: 0,
          runningCount: 0,
          succeededCount: 0,
          failedCount: 0,
          currentPhase,
          startTime: Date.now(),
        }

        runs.set(runID, run)
        journals.set(runID, { memory, disk })
        controllers.set(runID, controller)
        append(runID, {
          type: "log",
          data: { message: `Workflow "${meta?.name ?? "unnamed"}" started`, runID, resume: !!input.resumeRunID },
        })

        void executeRun(input, runID, controller, state, bridge)
          .then(() => {
            patchRun(runID, (current) =>
              current.status === "cancelled"
                ? current
                : { ...current, status: "completed", runningCount: 0, endTime: Date.now() },
            )
          })
          .catch((error) => {
            const cancelled = error instanceof WorkflowCancelledError || controller.signal.aborted
            append(runID, { type: "error", data: { error: stringifyError(error) } })
            patchRun(runID, (current) => ({
              ...current,
              status: cancelled ? "cancelled" : "failed",
              runningCount: 0,
              endTime: Date.now(),
            }))
          })
          .finally(() => {
            controllers.delete(runID)
          })

        return run
      })

    const getStatus = (runID: string): Effect.Effect<WorkflowRun | undefined> => Effect.sync(() => runs.get(runID))

    const cancel = (runID: string): Effect.Effect<void> =>
      Effect.sync(() => {
        const controller = controllers.get(runID)
        controller?.abort()
        patchRun(runID, (current) =>
          current.status === "running" ? { ...current, status: "cancelled", runningCount: 0, endTime: Date.now() } : current,
        )
        append(runID, { type: "log", data: { message: "Workflow cancelled" } })
      })

    const getJournal = (runID: string): Effect.Effect<ReadonlyArray<JournalEntry>> =>
      Effect.sync(() => journals.get(runID)?.memory.getEntries() ?? [])

    return Service.of({ start, getStatus, cancel, getJournal })
  }),
)

function extractMetaObject(script: string): string | undefined {
  const match = /export\s+const\s+meta\s*=/.exec(script)
  if (!match) return undefined
  const start = script.indexOf("{", match.index + match[0].length)
  if (start < 0) return undefined

  let depth = 0
  let quote: "'" | '"' | "`" | undefined
  let escape = false
  for (let i = start; i < script.length; i++) {
    const char = script[i]
    if (escape) {
      escape = false
      continue
    }
    if (quote) {
      if (char === "\\") escape = true
      else if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === "{") depth++
    if (char === "}") {
      depth--
      if (depth === 0) return script.slice(start, i + 1)
    }
  }
  return undefined
}

function executeScript(
  script: string,
  host: WorkflowHost,
  signal: AbortSignal,
  deadlineMs = SCRIPT_DEADLINE_MS,
): Promise<unknown> {
  assertSafeScript(script)
  return withDeadline(
    () => compileScript(script)(host),
    deadlineMs,
    signal,
    "Workflow script exceeded deadline",
  )
}

function compileScript(script: string): AsyncWorkflowFunction {
  const transformed = script
    .replace(/export\s+const\s+meta\s*=/, "const meta =")
    .replace(/export\s+default\s+/, "return ")
  if (/\b(?:import|export)\b/.test(stripStringsAndComments(transformed))) {
    throw new WorkflowExecutionError("Workflow scripts cannot use import/export")
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => AsyncWorkflowFunction
  return new AsyncFunction(
    "host",
    "process",
    "require",
    "module",
    "exports",
    "Bun",
    "Deno",
    "global",
    "globalThis",
    "window",
    "document",
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
    "Function",
    `
"use strict";
const { args, agent, parallel, pipeline, phase, log, workflow } = host;
return await (async () => {
${transformed}
})();
`,
  )
}

function assertSafeScript(script: string) {
  const checked = stripStringsAndComments(script)
  const forbidden = /\b(?:require|process|Bun|Deno|globalThis|global|window|document|fetch|WebSocket|XMLHttpRequest|eval|Function|constructor|__proto__)\b/
  const match = forbidden.exec(checked)
  if (match) {
    throw new WorkflowExecutionError(`Workflow script uses forbidden global: ${match[0]}`)
  }
}

function stripStringsAndComments(script: string) {
  let output = ""
  let quote: "'" | '"' | "`" | undefined
  let escape = false
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < script.length; i++) {
    const char = script[i]
    const next = script[i + 1]

    if (lineComment) {
      if (char === "\n") {
        lineComment = false
        output += "\n"
      } else {
        output += " "
      }
      continue
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        output += "  "
        i++
      } else {
        output += char === "\n" ? "\n" : " "
      }
      continue
    }

    if (quote) {
      if (escape) {
        escape = false
      } else if (char === "\\") {
        escape = true
      } else if (char === quote) {
        quote = undefined
      }
      output += char === "\n" ? "\n" : " "
      continue
    }

    if (char === "/" && next === "/") {
      lineComment = true
      output += "  "
      i++
      continue
    }

    if (char === "/" && next === "*") {
      blockComment = true
      output += "  "
      i++
      continue
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char
      output += " "
      continue
    }

    output += char
  }

  return output
}

function createLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []

  const acquire = async () => {
    if (active < max) {
      active++
      return
    }
    await new Promise<void>((resolve) => queue.push(resolve))
    active++
  }

  const release = () => {
    active--
    queue.shift()?.()
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}

function withDeadline<T>(
  task: () => Promise<T>,
  timeoutMs: number | undefined,
  signal: AbortSignal,
  timeoutMessage: string,
): Promise<T> {
  assertNotCancelled(signal)
  const deadline = timeoutMs ?? SCRIPT_DEADLINE_MS
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      fn()
    }
    const onAbort = () => finish(() => reject(new WorkflowCancelledError()))
    const timer = setTimeout(() => finish(() => reject(new WorkflowExecutionError(timeoutMessage))), deadline)
    signal.addEventListener("abort", onAbort, { once: true })
    try {
      task().then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

function assertNotCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new WorkflowCancelledError()
}

function parseModel(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const separator = model.indexOf("/")
  if (separator <= 0 || separator === model.length - 1) return undefined
  return {
    providerID: model.slice(0, separator),
    modelID: model.slice(separator + 1),
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : stableStringify(error)
}

export const defaultLayer = layer

export { SCRIPT_DEADLINE_MS, MAX_LIFECYCLE_AGENTS, DEFAULT_MAX_CONCURRENT, MAX_WORKFLOW_DEPTH, WORKFLOW_STRUCTURAL_ERROR }

export * as Workflow from "./runtime"
