import { describe, expect, test } from "bun:test"
import { Database } from "@swust-code/core/database/database"
import { ModelV2 } from "@swust-code/core/model"
import { ProviderV2 } from "@swust-code/core/provider"
import { Deferred, Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { Session } from "../../src/session/session"
import { SessionCheckpoint } from "../../src/session/checkpoint"
import { checkpointPath, metaDir } from "../../src/session/checkpoint-paths"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { spawnRef } from "../../src/actor/spawn-ref"
import type { AgentOutcome } from "../../src/actor/spawn"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(SessionCheckpoint.defaultLayer, Session.defaultLayer, Database.defaultLayer))

async function withCheckpoint<T>(body: string, fn: (sid: SessionID) => Promise<T>): Promise<T> {
  const sid = SessionID.make(`ses_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  try {
    const file = checkpointPath(sid)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await Bun.write(file, body)
    return await fn(sid)
  } finally {
    await fs.rm(metaDir(sid), { recursive: true, force: true })
  }
}

describe("SessionCheckpoint", () => {
  test("loads latest checkpoint and renders a MiMo-style index", async () => {
    await withCheckpoint("Topic: Actor state\n\n## Session checkpoint\nbody\n", async (sid) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const checkpoint = yield* SessionCheckpoint.Service
          expect(yield* checkpoint.hasCheckpoint(sid)).toBe(true)
          expect(yield* checkpoint.loadLatest(sid)).toContain("Topic: Actor state")
          expect(yield* checkpoint.loadCheckpoints(sid, 3)).toHaveLength(1)

          const index = yield* checkpoint.renderIndex(sid)
          expect(index).toContain("## Checkpoint")
          expect(index).toContain("Current checkpoint (Actor state): checkpoint.md")
          expect(index).toContain(checkpointPath(sid))
        }).pipe(Effect.provide(SessionCheckpoint.defaultLayer)),
      )
    })
  })

  test("writer skips when there are no main-slice messages", async () => {
    await withCheckpoint("Topic: No writer\n", async (sid) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const checkpoint = yield* SessionCheckpoint.Service
          expect(
            yield* checkpoint.tryStartCheckpointWriter({
              sessionID: sid,
              model: { providerID: "test", modelID: "test-model" },
            }),
          ).toBe("skipped")
          expect(yield* checkpoint.waitForWriter(sid)).toBe("no-writer")
          expect(yield* checkpoint.drainWriters()).toEqual({ drained: 0, timedOut: 0 })
          expect(yield* checkpoint.isWriterRunning(sid)).toBe(false)
        }).pipe(Effect.provide(SessionCheckpoint.defaultLayer)),
      )
    })
  })

  it.instance("starts checkpoint writer and records boundary after settlement", () =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const created = yield* sessions.create({ title: "checkpoint writer test" })
        const oldSpawn = spawnRef.current
        const outcome = yield* Deferred.make<AgentOutcome>()
        spawnRef.current = {
          spawn: (input) =>
            Effect.succeed({
              actorID: "checkpoint-writer-1",
              sessionID: input.sessionID,
              outcome,
            }),
          cancel: () => Effect.void,
          getForkContext: () => undefined,
        }
        return { sessions, sessionID: created.id, outcome, oldSpawn }
      }),
      ({ sessions, sessionID, outcome }) =>
        Effect.gen(function* () {
          const checkpoint = yield* SessionCheckpoint.Service
          const base = Date.now()

          const user = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            sessionID,
            agentID: "main",
            role: "user" as const,
            time: { created: base },
            agent: "build",
            model: {
              providerID: ProviderV2.ID.make("test"),
              modelID: ModelV2.ID.make("test-model"),
            },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID,
            messageID: user.id,
            type: "text",
            text: "please checkpoint this work",
          })

          const assistant = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            sessionID,
            agentID: "main",
            role: "assistant" as const,
            parentID: user.id,
            time: { created: base + 1, completed: base + 2 },
            agent: "build",
            mode: "build",
            path: { cwd: "", root: "" },
            cost: 0,
            modelID: ModelV2.ID.make("test-model"),
            providerID: ProviderV2.ID.make("test"),
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            finish: "stop",
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID,
            messageID: assistant.id,
            type: "text",
            text: "done",
          })

          expect(
            yield* checkpoint.tryStartCheckpointWriter({
              sessionID,
              model: { providerID: "test", modelID: "test-model" },
            }),
          ).toBe("started")
          expect(yield* checkpoint.isWriterRunning(sessionID)).toBe(true)

          yield* Deferred.succeed(outcome, { status: "success", finalText: "checkpoint written" })
          expect(yield* checkpoint.waitForWriter(sessionID)).toBe("success")
          yield* Effect.sleep("50 millis")
          expect(yield* checkpoint.lastBoundary(sessionID)).toBe(user.id)
          expect(yield* checkpoint.isWriterRunning(sessionID)).toBe(false)
        }),
      ({ sessions, sessionID, oldSpawn }) =>
        Effect.all(
          [
            Effect.sync(() => {
              spawnRef.current = oldSpawn
            }),
            sessions.remove(sessionID).pipe(Effect.ignore),
            Effect.promise(() => fs.rm(metaDir(sessionID), { recursive: true, force: true })).pipe(Effect.ignore),
          ],
          { discard: true },
        ),
    ),
  )

  it.instance("inserts checkpoint rebuild boundary and records lastBoundary", () =>
    Effect.acquireUseRelease(
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const created = yield* sessions.create({ title: "checkpoint boundary test" })
        return { sessions, sessionID: created.id }
      }),
      ({ sessions, sessionID }) =>
        Effect.gen(function* () {
          const checkpoint = yield* SessionCheckpoint.Service
          const base = Date.now()

          yield* Effect.promise(async () => {
            const file = checkpointPath(sessionID)
            await fs.mkdir(path.dirname(file), { recursive: true })
            await Bun.write(file, "Topic: Boundary\n\n## Session checkpoint\nrecovered context\n")
          })

          const boundary = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            sessionID,
            agentID: "main",
            role: "user" as const,
            time: { created: base },
            agent: "build",
            model: {
              providerID: ProviderV2.ID.make("test"),
              modelID: ModelV2.ID.make("test-model"),
            },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID,
            messageID: boundary.id,
            type: "text",
            text: "before checkpoint",
          })

          const after = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            sessionID,
            agentID: "main",
            role: "user" as const,
            time: { created: base + 10 },
            agent: "build",
            model: {
              providerID: ProviderV2.ID.make("test"),
              modelID: ModelV2.ID.make("test-model"),
            },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            sessionID,
            messageID: after.id,
            type: "text",
            text: "after checkpoint",
          })

          const inserted = yield* checkpoint.insertRebuildBoundary({
            sessionID,
            boundary: boundary.id,
            agent: "build",
            model: { providerID: "test", modelID: "test-model" },
            boundaryCreatedAt: base,
          })
          expect(inserted).toBe(true)
          expect(yield* checkpoint.lastBoundary(sessionID)).toBe(boundary.id)

          const messages = yield* sessions.messages({ sessionID, agentID: "*" })
          const marker = messages.find((msg) => msg.parts.some((part) => part.type === "checkpoint"))
          expect(marker).toBeDefined()
          if (!marker) throw new Error("missing checkpoint marker")
          const checkpointPart = marker.parts.find((part) => part.type === "checkpoint")
          expect(checkpointPart?.type).toBe("checkpoint")
          if (!checkpointPart || checkpointPart.type !== "checkpoint") throw new Error("missing checkpoint part")
          expect(checkpointPart.coveredUpTo).toBe(boundary.id)
          expect(marker.parts.some((part) => part.type === "text" && part.text.includes("recovered context"))).toBe(
            true,
          )

          const filtered = MessageV2.filterCompacted(yield* MessageV2.stream(sessionID, { agentID: "*" }))
          expect(filtered.map((msg) => msg.info.id)).toEqual([marker.info.id, after.id])
        }),
      ({ sessions, sessionID }) =>
        Effect.all(
          [
            sessions.remove(sessionID).pipe(Effect.ignore),
            Effect.promise(() => fs.rm(metaDir(sessionID), { recursive: true, force: true })).pipe(Effect.ignore),
          ],
          { discard: true },
        ),
    ),
  )
})
