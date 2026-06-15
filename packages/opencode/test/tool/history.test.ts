import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer, Result, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@swust-code/core/database/database"
import { MessageTable, PartTable, SessionTable } from "@swust-code/core/session/sql"
import { SessionV1 } from "@swust-code/core/v1/session"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { EventV2Bridge } from "@/event-v2-bridge"
import { History, WriterService } from "@/history"
import { HistoryFtsTable } from "@/history/fts.sql"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { HistoryTool, Parameters } from "@/tool/history"
import { ToolJsonSchema } from "@/tool/json-schema"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    Database.defaultLayer,
    EventV2Bridge.defaultLayer,
    History.defaultLayer,
    Truncate.defaultLayer,
    Agent.defaultLayer,
  ),
)

const toolCtx: Tool.Context = {
  sessionID: SessionID.make("ses_history_ctx"),
  messageID: MessageID.make("msg_history_ctx"),
  agent: "build",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const clearHistoryRows = Effect.fn("HistoryToolTest.clear")(function* () {
  const db = (yield* Database.Service).db
  const sessionID = SessionID.make("ses_history_tool")
  yield* db.delete(HistoryFtsTable).where(eq(HistoryFtsTable.session_id, sessionID)).run().pipe(Effect.orDie)
  yield* db
    .delete(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

const seed = Effect.fn("HistoryToolTest.seed")(function* () {
  const db = (yield* Database.Service).db
  const instance = yield* InstanceState.context
  const now = Date.now()
  const sessionID = SessionID.make("ses_history_tool")
  const messages = [
    MessageID.make("msg_history_0"),
    MessageID.make("msg_history_1"),
    MessageID.make("msg_history_2"),
  ]

  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: instance.project.id,
      slug: "history-tool",
      directory: instance.directory,
      title: "history tool",
      version: "1",
      time_created: now,
      time_updated: now,
    })
    .run()
    .pipe(Effect.orDie)

  for (let i = 0; i < messages.length; i++) {
    const id = messages[i]!
    yield* db
      .insert(MessageTable)
      .values({
        id,
        session_id: sessionID,
        agent_id: "main",
        data: { role: i === 1 ? "assistant" : "user" } as never,
        time_created: now + i,
        time_updated: now + i,
      })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(PartTable)
      .values({
        id: PartID.make(`prt_history_${i}`),
        message_id: id,
        session_id: sessionID,
        data: { type: "text", text: i === 1 ? "JWT signing test" : `body ${i}` } as never,
        time_created: now + i,
        time_updated: now + i,
      })
      .run()
      .pipe(Effect.orDie)
  }

  return { sessionID, messages }
})

describe("history tool", () => {
  it.effect("accepts the MiMo-compatible history parameters", () =>
    Effect.sync(() => {
      expect(
        Result.isSuccess(
          Schema.decodeUnknownResult(Parameters)({
            operation: "search",
            query: "JWT",
            scope: "global",
            kind: ["user_text", "assistant_text"],
            limit: 5,
          }),
        ),
      ).toBe(true)
      expect(
        Result.isSuccess(
          Schema.decodeUnknownResult(Parameters)({
            operation: "around",
            message_id: "msg_anchor",
            before: 1,
            after: 1,
          }),
        ),
      ).toBe(true)
      expect(ToolJsonSchema.fromSchema(Parameters).properties).toMatchObject({
        operation: expect.any(Object),
        query: expect.any(Object),
        scope: expect.any(Object),
        message_id: expect.any(Object),
      })
    }),
  )

  it.instance("search backfills session parts and returns formatted hits", () =>
    Effect.gen(function* () {
      yield* clearHistoryRows()
      const seeded = yield* seed()
      const info = yield* HistoryTool
      const tool = yield* info.init()

      const result = yield* tool.execute({ operation: "search", query: "JWT", scope: "global" }, toolCtx)

      expect(result.title).toBe("History search: 1 match")
      expect(result.metadata.count).toBe(1)
      expect(result.output).toContain(seeded.messages[1])
      expect(result.output).toContain("assistant_text")
      expect(result.output).toContain("JWT")

      const db = (yield* Database.Service).db
      const indexed = yield* db.select().from(HistoryFtsTable).all().pipe(Effect.orDie)
      expect(indexed.length).toBeGreaterThan(0)
    }),
  )

  it.instance("around returns surrounding messages and marks the anchor", () =>
    Effect.gen(function* () {
      yield* clearHistoryRows()
      const seeded = yield* seed()
      const info = yield* HistoryTool
      const tool = yield* info.init()

      const result = yield* tool.execute(
        { operation: "around", message_id: seeded.messages[1], before: 1, after: 1 },
        toolCtx,
      )

      expect(result.title).toBe(`History around ${seeded.messages[1]}`)
      expect(result.metadata.count).toBe(3)
      expect(result.output).toContain(`>>> ${seeded.messages[1]}`)
      expect(result.output).toContain(`--- ${seeded.messages[0]}`)
      expect(result.output).toContain(`--- ${seeded.messages[2]}`)
      expect(result.output).toContain("JWT signing test")
    }),
  )

  it.instance("writer indexes part update events and removes deleted parts", () =>
    Effect.gen(function* () {
      yield* clearHistoryRows()
      const seeded = yield* seed()
      const writer = yield* WriterService
      const events = yield* EventV2Bridge.Service
      const db = (yield* Database.Service).db
      const partID = PartID.make("prt_history_writer")
      const part = {
        id: partID,
        sessionID: seeded.sessionID,
        messageID: seeded.messages[1],
        type: "text",
        text: "writer live indexing phrase",
      } as SessionV1.Part

      yield* writer.init()
      yield* events.publish(SessionV1.Event.PartUpdated, {
        sessionID: seeded.sessionID,
        part,
        time: Date.now(),
      })

      const indexed = yield* pollWithTimeout(
        db
          .select()
          .from(HistoryFtsTable)
          .where(eq(HistoryFtsTable.part_id, partID))
          .get()
          .pipe(Effect.orDie, Effect.map((row) => (row?.body.includes("writer live") ? row : undefined))),
        "history writer did not index part update",
      )
      expect(indexed.kind).toBe("assistant_text")

      yield* events.publish(SessionV1.Event.PartRemoved, {
        sessionID: seeded.sessionID,
        messageID: seeded.messages[1],
        partID,
      })

      const removed = yield* pollWithTimeout(
        db
          .select()
          .from(HistoryFtsTable)
          .where(eq(HistoryFtsTable.part_id, partID))
          .get()
          .pipe(Effect.orDie, Effect.map((row) => (row ? undefined : true))),
        "history writer did not remove deleted part",
      )
      expect(removed).toBe(true)
    }),
  )
})
