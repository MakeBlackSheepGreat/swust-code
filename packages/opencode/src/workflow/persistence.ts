/**
 * Workflow Journal - crash recovery for workflow execution.
 *
 * Each workflow run has a .jsonl journal file that records every
 * agent result, phase change, and log message. On crash recovery,
 * the journal is replayed to skip already-completed work.
 *
 * Key design decisions:
 * - Synchronous writes (appendFileSync) to avoid starving the QuickJS pump
 * - Deterministic keys from sha256(prompt + agentType + model + schema + phase)
 * - Script SHA validation: if the script changed, the journal is cleared
 * - Monotonically increasing pass counter for deduplication
 *
 * Ported from MiMo-Code's workflow/persistence.ts.
 */

import fs from "fs"
import path from "path"
import { createHash } from "crypto"

// Types
export type JournalEventType = "agent" | "log" | "phase" | "error"

export interface JournalEvent {
  readonly t: JournalEventType
  readonly key?: string
  readonly result?: unknown
  readonly msg?: string
  readonly title?: string
  readonly pass: number
}

export interface JournalState {
  readonly results: Map<string, unknown>
  readonly pass: number
}

/**
 * Compute a deterministic key for an agent call.
 * Used for journal deduplication on crash recovery.
 */
export function computeAgentKey(input: {
  readonly prompt: string
  readonly agentType?: string
  readonly model?: string
  readonly schema?: string
  readonly phase?: string
  readonly occurrence: number
}): string {
  const hash = createHash("sha256")
  hash.update(input.prompt)
  hash.update(input.agentType ?? "")
  hash.update(input.model ?? "")
  hash.update(input.schema ?? "")
  hash.update(input.phase ?? "")
  const digest = hash.digest("hex").slice(0, 16)
  return `${digest}:${input.occurrence}`
}

/**
 * Compute SHA of a workflow script for invalidation detection.
 */
export function computeScriptSha(script: string): string {
  return createHash("sha256").update(script).digest("hex").slice(0, 16)
}

export class WorkflowJournal {
  private readonly journalPath: string
  private readonly scriptPath: string
  private entries: JournalEvent[] = []
  private resultCache = new Map<string, unknown>()
  private currentPass = 0

  constructor(dataDir: string, runID: string) {
    const workflowDir = path.join(dataDir, "workflow")
    fs.mkdirSync(workflowDir, { recursive: true })
    this.journalPath = path.join(workflowDir, `${runID}.jsonl`)
    this.scriptPath = path.join(workflowDir, `${runID}.js`)
  }

  /**
   * Load existing journal from disk. Returns the cached results and next pass number.
   * Torn/partial lines from crash mid-append are silently skipped.
   */
  load(): JournalState {
    this.resultCache.clear()
    this.currentPass = 0

    try {
      const content = fs.readFileSync(this.journalPath, "utf-8")
      const lines = content.split("\n").filter((l) => l.trim())

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as JournalEvent
          this.entries.push(event)

          if (event.t === "agent" && event.key && event.result !== undefined) {
            this.resultCache.set(event.key, event.result)
          }
          if (event.pass > this.currentPass) {
            this.currentPass = event.pass
          }
        } catch {
          // Torn line from crash mid-append - skip silently
        }
      }
    } catch {
      // Journal doesn't exist yet - that's fine
    }

    return {
      results: new Map(this.resultCache),
      pass: this.currentPass + 1,
    }
  }

  /**
   * Append an event to the journal. Synchronous to avoid starving the QuickJS pump.
   */
  append(event: Omit<JournalEvent, "pass">): void {
    const fullEvent = { ...event, pass: this.currentPass }
    this.entries.push(fullEvent)

    if (event.t === "agent" && event.key && event.result !== undefined) {
      this.resultCache.set(event.key, event.result)
    }

    // Synchronous write - intentional for crash safety
    fs.appendFileSync(this.journalPath, JSON.stringify(fullEvent) + "\n")
  }

  /**
   * Check if an agent result already exists in the journal.
   */
  hasResult(key: string): boolean {
    return this.resultCache.has(key)
  }

  /**
   * Get a cached agent result from the journal.
   */
  getResult(key: string): unknown {
    return this.resultCache.get(key)
  }

  /**
   * Save the script body for change detection on resume.
   */
  saveScript(script: string): void {
    fs.writeFileSync(this.scriptPath, script, "utf-8")
  }

  /**
   * Check if the script has changed since the journal was created.
   * If changed, clear the journal to prevent stale replay.
   */
  validateScript(currentScript: string): boolean {
    try {
      const savedScript = fs.readFileSync(this.scriptPath, "utf-8")
      if (savedScript === currentScript) return true

      // Script changed - clear journal
      this.clear()
      return false
    } catch {
      // No saved script - treat as new
      return false
    }
  }

  /**
   * Clear the journal and result cache.
   */
  clear(): void {
    this.entries = []
    this.resultCache.clear()
    this.currentPass = 0
    try {
      fs.writeFileSync(this.journalPath, "", "utf-8")
    } catch {
      // Ignore errors on clear
    }
  }

  /**
   * Get all entries for debugging/inspection.
   */
  getEntries(): ReadonlyArray<JournalEvent> {
    return [...this.entries]
  }

  /**
   * Get the last phase from the journal.
   */
  getLastPhase(): string | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].t === "phase" && this.entries[i].title) {
        return this.entries[i].title
      }
    }
    return undefined
  }
}
