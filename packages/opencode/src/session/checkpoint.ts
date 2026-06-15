import fs from "fs/promises"
import path from "path"
import { Context, Deferred, Effect, Layer, Scope } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { LayerNode } from "@swust-code/core/effect/layer-node"
import { ModelV2 } from "@swust-code/core/model"
import { ProviderV2 } from "@swust-code/core/provider"
import { readBudgeted, readBudgetedSectionAware } from "@swust-code/core/session/budgeted-read"
import { SessionTable } from "@swust-code/core/session/sql"
import { Project } from "@swust-code/core/project"
import { Session } from "./session"
import { MessageV2 } from "./message-v2"
import { MessageID, PartID, SessionID } from "./schema"
import { checkpointPath, globalMemoryPath, memoryPath, metaDir, migrateProjectMemory, notesPath, tasksDir } from "./checkpoint-paths"
import { CHECKPOINT_SECTION_BUDGETS, CHECKPOINT_TEMPLATE, MEMORY_TEMPLATE, NOTES_TEMPLATE } from "./checkpoint-templates"
import { buildProgressDiff } from "./checkpoint-progress-reconcile"
import { loadPriorDiscoveredTitles } from "./checkpoint-retry"
import * as CheckpointContext from "./checkpoint-context"
import { TaskRegistry } from "@/task/registry"
import { ActorRegistry } from "@/actor/registry"
import { spawnRef } from "@/actor/spawn-ref"
import type { AgentOutcome } from "@/actor/spawn"
import { Token } from "@/util/token"

export type TryStartCheckpointWriterInput = {
  readonly sessionID: SessionID
  readonly model: { readonly providerID: string; readonly modelID: string }
  readonly promptOps?: unknown
}

export type TryStartCheckpointWriterResult = "started" | "queued" | "skipped"
export type WriterOutcome = "success" | "failure"

export interface Interface {
  readonly tryStartCheckpointWriter: (
    input: TryStartCheckpointWriterInput,
  ) => Effect.Effect<TryStartCheckpointWriterResult>
  readonly waitForWriter: (sessionID: SessionID) => Effect.Effect<WriterOutcome | "no-writer">
  readonly drainWriters: (input?: { timeoutMs?: number }) => Effect.Effect<{ drained: number; timedOut: number }>
  readonly hasCheckpoint: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly hasMemoryOrTasks: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly loadLatest: (sessionID: SessionID) => Effect.Effect<string | undefined>
  readonly loadCheckpoints: (sessionID: SessionID, count: number) => Effect.Effect<string[]>
  readonly renderIndex: (sessionID: SessionID) => Effect.Effect<string>
  readonly renderRebuildContext: (
    sessionID: SessionID,
    opts?: { lastMessageInfo?: unknown; agentID?: string },
  ) => Effect.Effect<string>
  readonly lastBoundary: (sessionID: SessionID) => Effect.Effect<MessageID | undefined>
  readonly isWriterRunning: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly insertRebuildBoundary: (input: {
    sessionID: SessionID
    boundary: MessageID
    lastMessageInfo?: unknown
    agentID?: string
    agent: string
    model: { providerID: string; modelID: string }
    boundaryCreatedAt?: number
  }) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/SessionCheckpoint") {}

const DEFAULT_CAPS = {
  tasks_ledger: 2000,
  actor_ledger: 500,
  checkpoint: 11_000,
  memory: 10_000,
  notes: 6000,
  global: 6000,
}

const TAIL_MIN_TOKENS = 10_000
const TAIL_MAX_TOKENS = 20_000
const TAIL_MIN_TEXT_BLOCK_MESSAGES = 5

const COMPACTABLE_TOOL_NAMES = new Set<string>([
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

function truncateChars(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return input.slice(0, Math.max(0, maxChars - 40)) + "\n... (truncated)"
}

function renderStatus(status: string) {
  switch (status) {
    case "open":
      return "open"
    case "in_progress":
      return "in_progress"
    case "blocked":
      return "blocked"
    case "done":
      return "done"
    case "abandoned":
      return "abandoned"
    default:
      return status
  }
}

async function ensureCheckpointTemplate(checkpointFile: string): Promise<void> {
  if (!(await Bun.file(checkpointFile).exists())) {
    await fs.mkdir(path.dirname(checkpointFile), { recursive: true })
    await Bun.write(checkpointFile, CHECKPOINT_TEMPLATE)
  }
}

async function ensureMemoryTemplate(memoryFile: string): Promise<void> {
  if (!(await Bun.file(memoryFile).exists())) {
    await fs.mkdir(path.dirname(memoryFile), { recursive: true })
    await Bun.write(memoryFile, MEMORY_TEMPLATE)
  }
}

async function ensureNotesTemplate(notesFile: string): Promise<void> {
  if (!(await Bun.file(notesFile).exists())) {
    await fs.mkdir(path.dirname(notesFile), { recursive: true })
    await Bun.write(notesFile, NOTES_TEMPLATE)
  }
}

function estimateMessageTokens(message: { parts: Array<{ type: string; [key: string]: unknown }> }): number {
  let sum = 0
  for (const part of message.parts) {
    try {
      sum += Token.estimate(JSON.stringify(part))
    } catch {
      sum += 1000
    }
  }
  return sum
}

function hasTextBlocks(message: { parts: Array<{ type: string }> }): boolean {
  return message.parts.some((part) => part.type === "text" || part.type === "reasoning")
}

export function computeBoundary(
  msgs: ReadonlyArray<{
    info: { id: string; role: "user" | "assistant"; finish?: string }
    parts: Array<{ type: string; [key: string]: unknown }>
  }>,
): string {
  if (msgs.length === 0) return ""
  const lastAsstIdx = msgs.findLastIndex((message) => message.info.role === "assistant" && message.info.finish !== undefined)
  if (lastAsstIdx <= 0) return msgs[lastAsstIdx >= 0 ? lastAsstIdx : 0].info.id

  const tokens = msgs.map((message) => estimateMessageTokens(message))
  let startIdx = lastAsstIdx - 1
  let tailSum = 0
  let textBlockCount = 0
  for (let index = startIdx; index < msgs.length; index++) {
    tailSum += tokens[index]
    if (hasTextBlocks(msgs[index])) textBlockCount += 1
  }

  if (tailSum >= TAIL_MAX_TOKENS) return msgs[startIdx].info.id

  while (
    startIdx > 0 &&
    tailSum < TAIL_MAX_TOKENS &&
    (tailSum < TAIL_MIN_TOKENS || textBlockCount < TAIL_MIN_TEXT_BLOCK_MESSAGES)
  ) {
    startIdx -= 1
    tailSum += tokens[startIdx]
    if (hasTextBlocks(msgs[startIdx])) textBlockCount += 1
  }
  return msgs[startIdx].info.id
}

function renderSectionBudgets(budgets: Record<string, number>): string {
  const entries = Object.entries(budgets)
  if (entries.length === 0) throw new Error("CHECKPOINT_SECTION_BUDGETS is empty")
  const cols = 3
  const lines = ["Section budgets (~tokens):"]
  for (let index = 0; index < entries.length; index += cols) {
    lines.push(`   ${entries.slice(index, index + cols).map(([key, value]) => `${key}: ${value}`).join("    ")}`)
  }
  return lines.join("\n")
}

function composeWriterPrompt(input: {
  checkpointFile: string
  memoryFile: string
  taskMemDir: string
  notesFile: string
  rangeDesc: string
  progressDiff: string
}): string {
  return [
    "<system-reminder>",
    "You are now operating in checkpoint-writer mode. Ignore the general coding-assistant framing in the system prompt above. The read, write, edit, glob, grep, and task tools are available; do not invoke others.",
    "",
    "========================================================================",
    "ABSOLUTE PATHS - USE THESE VERBATIM. NEVER COMPUTE, INFER, OR MODIFY.",
    "========================================================================",
    "",
    `CHECKPOINT_PATH = ${input.checkpointFile}`,
    `MEMORY_PATH     = ${input.memoryFile}`,
    `TASK_MEM_DIR    = ${input.taskMemDir}`,
    `NOTES_PATH      = ${input.notesFile}`,
    "",
    "When using the Write tool, the first arg MUST be one of these literal absolute paths.",
    "For task narrative, use TASK_MEM_DIR + '/' + task_id + '/progress.md' or '/notes.md'.",
    "Do not abbreviate paths. Do not change parent directories.",
    "========================================================================",
    "",
    input.progressDiff,
    "",
    renderSectionBudgets(CHECKPOINT_SECTION_BUDGETS),
    "",
    "Write the next checkpoint for this session using the existing checkpoint.md and MEMORY.md structure.",
    "</system-reminder>",
    "",
    "Write the next checkpoint for this session.",
    "",
    input.rangeDesc,
    "",
    "Use the task tool for task state operations. Use write/edit/apply_patch for checkpoint, memory, notes, and task narrative files at the exact paths declared above. After all writes and tool calls, stop immediately.",
  ].join("\n")
}

interface WriterState {
  writing: Deferred.Deferred<AgentOutcome>
  pending?: TryStartCheckpointWriterInput
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const tasks = yield* TaskRegistry.Service
    const actors = yield* ActorRegistry.Service
    const { db } = yield* Database.Service
    const scope = yield* Scope.Scope
    const writers = new Map<SessionID, WriterState>()

    function startCheckpointWriter(input: TryStartCheckpointWriterInput): Effect.Effect<TryStartCheckpointWriterResult> {
      return Effect.gen(function* () {
      const existing = writers.get(input.sessionID)
      if (existing) {
        existing.pending = input
        return "queued" as const
      }

      const rawMsgs = yield* sessions
          .messages({ sessionID: input.sessionID, agentID: "main" })
          .pipe(Effect.catch(() => Effect.succeed([])))
      const msgs = MessageV2.filterCompacted(
        [...rawMsgs].sort(
          (a, b) => b.info.time.created - a.info.time.created || b.info.id.localeCompare(a.info.id),
        ),
      )
      if (msgs.length === 0) return "skipped" as const

      const candidateID = computeBoundary(msgs)
      const boundaryIdx = msgs.findIndex((message) => message.info.id === candidateID)
      const endMessageID = msgs[Math.max(boundaryIdx, 0)]?.info.id ?? candidateID
      if (!endMessageID) return "skipped" as const

      const row = yield* db
        .select({ last: SessionTable.last_checkpoint_message_id })
        .from(SessionTable)
        .where(eq(SessionTable.id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      const lastCheckpointMessageID = row?.last ?? undefined
      const lastIdx = lastCheckpointMessageID
        ? msgs.findIndex((message) => message.info.id === lastCheckpointMessageID)
        : -1
      const watermarkIdx = msgs.findIndex((message) => message.info.id === endMessageID)
      if (watermarkIdx < 0) return "skipped" as const
      if (lastIdx >= watermarkIdx) return "skipped" as const

      const sessionInfo = yield* sessions.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const projectID = sessionInfo?.projectID ?? Project.ID.global
      yield* Effect.promise(() => migrateProjectMemory(projectID)).pipe(Effect.ignore)

      const sessMemDir = metaDir(input.sessionID)
      const checkpointFile = checkpointPath(input.sessionID)
      const memoryFile = memoryPath(projectID)
      const taskMemDir = tasksDir(input.sessionID)
      const notesFile = notesPath(input.sessionID)

      yield* Effect.promise(() => fs.mkdir(sessMemDir, { recursive: true }))
      yield* Effect.promise(() => fs.mkdir(taskMemDir, { recursive: true }))
      yield* Effect.promise(() => fs.mkdir(path.dirname(memoryFile), { recursive: true }))
      yield* Effect.promise(() => ensureCheckpointTemplate(checkpointFile))
      yield* Effect.promise(() => ensureMemoryTemplate(memoryFile))
      yield* Effect.promise(() => ensureNotesTemplate(notesFile))

      const checkpointExists = yield* Effect.promise(() => Bun.file(checkpointFile).exists())
      const memoryExists = yield* Effect.promise(() => Bun.file(memoryFile).exists())
      const rangeDesc = checkpointExists
        ? [
            `Previous checkpoint: ${checkpointFile}`,
            memoryExists ? `Previous memory: ${memoryFile}` : "",
            "Read both files before writing the next checkpoint. Deduplicate prior discovered knowledge and carry forward still-live context.",
          ]
            .filter(Boolean)
            .join("\n")
        : "This is the first checkpoint of this session. No prior checkpoint exists."
      const progressDiff = yield* Effect.promise(() => buildProgressDiff(input.sessionID))
      const promptText = composeWriterPrompt({ checkpointFile, memoryFile, taskMemDir, notesFile, rangeDesc, progressDiff })

      const actor = spawnRef.current
      if (!actor) return "skipped" as const

      const writerChildSession = yield* sessions.create({
        parentID: input.sessionID,
        title: `checkpoint-writer: ${input.sessionID}`,
        agent: "checkpoint-writer",
        model: {
          providerID: ProviderV2.ID.make(input.model.providerID),
          id: ModelV2.ID.make(input.model.modelID),
        },
      })

      const result = yield* actor.spawn({
        mode: "subagent",
        sessionID: writerChildSession.id,
        parentSessionID: input.sessionID,
        agentType: "checkpoint-writer",
        description: `checkpoint writer for session ${input.sessionID}`,
        task: promptText,
        background: true,
        lifecycle: "ephemeral",
        model: input.model,
      })

      const priorTitles = yield* Effect.promise(() => loadPriorDiscoveredTitles(input.sessionID))
      CheckpointContext.set(input.sessionID, result.actorID, {
        priorTitles,
        expectedRevisions: [],
      })

      writers.set(input.sessionID, { writing: result.outcome })

      yield* Effect.gen(function* () {
        yield* Deferred.await(result.outcome).pipe(Effect.catch(() => Effect.succeed<AgentOutcome>({ status: "failure", error: "writer failed" })))
        yield* db
          .update(SessionTable)
          .set({ last_checkpoint_message_id: endMessageID as MessageID })
          .where(eq(SessionTable.id, input.sessionID))
          .run()
          .pipe(Effect.orDie)

        const pending = writers.get(input.sessionID)?.pending
        writers.delete(input.sessionID)
        if (pending) yield* startCheckpointWriter(pending).pipe(Effect.ignore)
      }).pipe(
        Effect.ensuring(Effect.sync(() => CheckpointContext.remove(input.sessionID, result.actorID))),
        Effect.forkIn(scope),
      )

        return "started" as const
      })
    }

    const tryStartCheckpointWriter = startCheckpointWriter

    const waitForWriter = Effect.fn("SessionCheckpoint.waitForWriter")(function* (sessionID: SessionID) {
      const state = writers.get(sessionID)
      if (!state) return "no-writer" as const
      const outcome = yield* Deferred.await(state.writing).pipe(
        Effect.timeout(300_000),
        Effect.catch(() => Effect.succeed<AgentOutcome>({ status: "failure", error: "timeout" })),
      )
      return outcome.status === "success" ? ("success" as const) : ("failure" as const)
    })

    const drainWriters = Effect.fn("SessionCheckpoint.drainWriters")(function* (input?: { timeoutMs?: number }) {
      const pending = [...writers.values()]
      if (pending.length === 0) return { drained: 0, timedOut: 0 }
      yield* Effect.all(pending.map((state) => Deferred.await(state.writing)), { concurrency: "unbounded" }).pipe(
        Effect.timeout(input?.timeoutMs ?? 120_000),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      const timedOut = writers.size
      return { drained: pending.length - timedOut, timedOut }
    })

    const hasCheckpoint = Effect.fn("SessionCheckpoint.hasCheckpoint")(function* (sessionID: SessionID) {
      return yield* Effect.promise(() => Bun.file(checkpointPath(sessionID)).exists())
    })

    const loadLatest = Effect.fn("SessionCheckpoint.loadLatest")(function* (sessionID: SessionID) {
      return yield* Effect.promise(async () => {
        const file = Bun.file(checkpointPath(sessionID))
        if (!(await file.exists())) return undefined
        const text = await file.text()
        return text.trim() ? text : undefined
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
    })

    const loadCheckpoints = Effect.fn("SessionCheckpoint.loadCheckpoints")(function* (
      sessionID: SessionID,
      count: number,
    ) {
      if (count <= 0) return []
      const latest = yield* loadLatest(sessionID)
      return latest ? [latest] : []
    })

    const renderIndex = Effect.fn("SessionCheckpoint.renderIndex")(function* (sessionID: SessionID) {
      const latest = yield* loadLatest(sessionID)
      if (!latest) return "No checkpoints yet for this session."
      const topic = latest.match(/^Topic:\s*(.+)$/m)?.[1]?.trim() ?? "(unknown)"
      return [
        "## Checkpoint",
        "",
        `Directory: ${metaDir(sessionID)}/`,
        "",
        `Current checkpoint (${topic}): checkpoint.md [shown below]`,
        "",
        `Use read("${checkpointPath(sessionID)}") to access the full checkpoint.`,
      ].join("\n")
    })

    const hasMemoryOrTasks = Effect.fn("SessionCheckpoint.hasMemoryOrTasks")(function* (sessionID: SessionID) {
      if (yield* hasCheckpoint(sessionID)) return true
      const taskRows = yield* tasks
        .list({ session_id: sessionID, include_terminal: true })
        .pipe(Effect.catch(() => Effect.succeed([])))
      return taskRows.length > 0
    })

    const renderRebuildContext = Effect.fn("SessionCheckpoint.renderRebuildContext")(function* (
      sessionID: SessionID,
      opts?: { lastMessageInfo?: unknown; agentID?: string },
    ) {
      if (opts?.agentID && opts.agentID !== "main") return ""

      const session = yield* sessions.get(sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const projectID = session?.projectID ?? Project.ID.global
      yield* Effect.promise(() => migrateProjectMemory(projectID)).pipe(Effect.ignore)

      const [taskRows, checkpoint, projectMemory, globalMemory, notes, activeActors] = yield* Effect.all([
        tasks.list({ session_id: sessionID, include_terminal: true }).pipe(Effect.catch(() => Effect.succeed([]))),
        Effect.promise(() => readBudgetedSectionAware(checkpointPath(sessionID), DEFAULT_CAPS.checkpoint)),
        Effect.promise(() => readBudgetedSectionAware(memoryPath(projectID), DEFAULT_CAPS.memory)),
        Effect.promise(() => readBudgetedSectionAware(globalMemoryPath(), DEFAULT_CAPS.global)),
        Effect.promise(() => readBudgeted(notesPath(sessionID), DEFAULT_CAPS.notes)),
        actors.listActive().pipe(Effect.catch(() => Effect.succeed([]))),
      ])

      if (
        taskRows.length === 0 &&
        !checkpoint?.text?.trim() &&
        !projectMemory?.text?.trim() &&
        !globalMemory?.text?.trim() &&
        !notes?.text?.trim() &&
        activeActors.length === 0
      ) {
        return ""
      }

      const lines: string[] = [
        "The following blocks are auto-loaded from your session memory. They are already in your context. Use targeted reads for specific facts instead of reading whole memory files.",
        "",
      ]

      lines.push("## Tasks ledger")
      if (taskRows.length === 0) {
        lines.push("(none)")
      } else {
        const taskLines = taskRows.map((task) => `- ${task.id} ${renderStatus(task.status)} - ${task.summary}`)
        lines.push(truncateChars(taskLines.join("\n"), DEFAULT_CAPS.tasks_ledger * 4))
      }
      lines.push("")

      if (checkpoint?.text?.trim()) {
        lines.push("## Session checkpoint")
        lines.push(checkpoint.text.trim())
        lines.push("")
      }

      if (activeActors.length > 0) {
        lines.push("## Active actors")
        const actorLines = activeActors.map(
          (actor) => `- ${actor.actorID} - ${actor.status}, "${actor.description ?? "working"}" (agent=${actor.agent})`,
        )
        lines.push(truncateChars(actorLines.join("\n"), DEFAULT_CAPS.actor_ledger * 4))
        lines.push("")
      }

      if (projectMemory?.text?.trim()) {
        lines.push("## Project memory")
        lines.push(projectMemory.text.trim())
        lines.push("")
      }

      if (globalMemory?.text?.trim()) {
        lines.push("## Global memory")
        lines.push(globalMemory.text.trim())
        lines.push("")
      }

      if (notes?.text?.trim()) {
        lines.push("## Session notes")
        lines.push(notes.text.trim())
        lines.push("")
      }

      lines.push(
        "This session is being continued from a previous conversation that hit a checkpoint. The session checkpoint and memory above cover the earlier portion of the conversation.",
      )
      lines.push("")
      lines.push(
        "Recent messages are preserved verbatim below. Continue directly from the latest state without recapping this memory dump.",
      )

      return lines.join("\n")
    })

    const lastBoundary = Effect.fn("SessionCheckpoint.lastBoundary")(function* (sessionID: SessionID) {
      const row = yield* db
        .select({ last_checkpoint_message_id: SessionTable.last_checkpoint_message_id })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      return row?.last_checkpoint_message_id ?? undefined
    })

    const isWriterRunning = Effect.fn("SessionCheckpoint.isWriterRunning")(function* (sessionID: SessionID) {
      return writers.has(sessionID)
    })

    const insertRebuildBoundary = Effect.fn("SessionCheckpoint.insertRebuildBoundary")(function* (input: {
      sessionID: SessionID
      boundary: MessageID
      lastMessageInfo?: unknown
      agentID?: string
      agent: string
      model: { providerID: string; modelID: string }
      boundaryCreatedAt?: number
    }) {
      const rebuildContext = yield* renderRebuildContext(input.sessionID, {
        lastMessageInfo: input.lastMessageInfo,
        agentID: input.agentID,
      }).pipe(Effect.catch(() => Effect.succeed("")))
      if (!rebuildContext) return false

      const indexText = yield* renderIndex(input.sessionID).pipe(Effect.catch(() => Effect.succeed("")))
      const syntheticTime = (input.boundaryCreatedAt ?? Date.now()) + 1
      const msg = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        sessionID: input.sessionID,
        agentID: input.agentID ?? "main",
        role: "user" as const,
        agent: input.agent,
        model: {
          providerID: ProviderV2.ID.make(input.model.providerID),
          modelID: ModelV2.ID.make(input.model.modelID),
        },
        time: { created: syntheticTime },
      })

      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: input.sessionID,
        messageID: msg.id,
        type: "checkpoint",
        checkpointDir: "",
        checkpointNumber: 0,
        coveredUpTo: input.boundary,
      })

      if (indexText) {
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: input.sessionID,
          messageID: msg.id,
          type: "text",
          synthetic: true,
          text: indexText,
        })
      }

      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: input.sessionID,
        messageID: msg.id,
        type: "text",
        synthetic: true,
        text: rebuildContext,
      })

      const actorsText = yield* actors.renderForAgent(input.sessionID).pipe(Effect.catch(() => Effect.succeed("")))
      if (actorsText) {
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: input.sessionID,
          messageID: msg.id,
          type: "text",
          synthetic: true,
          text: actorsText,
        })
      }

      yield* db
        .update(SessionTable)
        .set({ last_checkpoint_message_id: input.boundary })
        .where(eq(SessionTable.id, input.sessionID))
        .run()
        .pipe(Effect.orDie)

      const allMsgs = yield* sessions
        .messages({ sessionID: input.sessionID, agentID: "*" })
        .pipe(Effect.catch(() => Effect.succeed([])))
      const boundaryTime =
        input.boundaryCreatedAt ?? allMsgs.find((m) => m.info.id === input.boundary)?.info.time.created
      if (boundaryTime === undefined) return true

      for (const m of allMsgs) {
        if (m.info.id === msg.id) continue
        if (m.info.time.created <= boundaryTime) continue
        for (const part of m.parts) {
          if (part.type !== "tool") continue
          if (!COMPACTABLE_TOOL_NAMES.has(part.tool)) continue
          if (part.state.status !== "completed") continue
          if (part.state.time.compacted) continue
          part.state.time.compacted = Date.now()
          yield* sessions.updatePart(part)
        }
      }

      return true
    })

    return Service.of({
      tryStartCheckpointWriter,
      waitForWriter,
      drainWriters,
      hasCheckpoint,
      hasMemoryOrTasks,
      loadLatest,
      loadCheckpoints,
      renderIndex,
      renderRebuildContext,
      lastBoundary,
      isWriterRunning,
      insertRebuildBoundary,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Session.defaultLayer),
    Layer.provide(Database.defaultLayer),
    Layer.provide(TaskRegistry.defaultLayer),
    Layer.provide(ActorRegistry.defaultLayer),
  ),
)

export const node = LayerNode.make(layer, [Session.node, Database.node, TaskRegistry.node, ActorRegistry.node])

export * as SessionCheckpoint from "./checkpoint"
