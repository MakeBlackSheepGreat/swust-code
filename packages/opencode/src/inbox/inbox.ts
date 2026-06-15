import { LayerNode } from "@swust-code/core/effect/layer-node"
import { Context, Effect, Layer, Scope, Schema } from "effect"
import { and, asc, eq, inArray, lte } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@swust-code/core/database/database"
import * as ActorRegistry from "@/actor/registry"
import { Session } from "@/session/session"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { inboxServiceRef, sessionPromptRef } from "./inbox-ref"
import { InboxTable, type InboxRow } from "./inbox.sql"
import { renderInboxMessage } from "./render"

const GC_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_DRAIN_PER_TURN = 100

export class InboxReceiverNotFound extends Schema.TaggedErrorClass<InboxReceiverNotFound>()(
  "InboxReceiverNotFound",
  {
    receiverSessionID: Schema.String,
    receiverActorID: Schema.String,
  },
) {}

export interface InboxMessage {
  readonly id: string
  readonly receiverSessionID: SessionID
  readonly receiverActorID: string
  readonly senderSessionID?: SessionID
  readonly senderActorID?: string
  readonly type: string
  readonly content: string
  readonly createdAt: number
}

export interface SendInput {
  readonly receiverSessionID: SessionID
  readonly receiverActorID: string
  readonly senderSessionID?: SessionID
  readonly senderActorID?: string
  readonly content: string
  readonly type?: string
}

export interface SendResult {
  readonly inboxID: string
}

export interface Interface {
  readonly send: (input: SendInput) => Effect.Effect<SendResult, InboxReceiverNotFound>
  readonly list: (sessionID: SessionID, actorID: string) => Effect.Effect<InboxMessage[]>
  readonly drain: (sessionID: SessionID, actorID: string) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/Inbox") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const registry = yield* ActorRegistry.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const { db } = yield* Database.Service

    yield* db.delete(InboxTable).where(lte(InboxTable.created_at, Date.now() - GC_TTL_MS)).run().pipe(Effect.orDie)

    const toMessage = (row: InboxRow): InboxMessage => ({
      id: row.id,
      receiverSessionID: row.receiver_session_id,
      receiverActorID: row.receiver_actor_id,
      ...(row.sender_session_id ? { senderSessionID: row.sender_session_id } : {}),
      ...(row.sender_actor_id ? { senderActorID: row.sender_actor_id } : {}),
      type: row.type,
      content: row.content.text ?? "",
      createdAt: row.created_at,
    })

    const ensureReceiver = Effect.fn("Inbox.ensureReceiver")(function* (sessionID: SessionID, actorID: string) {
      if (actorID === "main") {
        yield* sessions.get(sessionID).pipe(
          Effect.catch(() =>
            Effect.fail(
              new InboxReceiverNotFound({
                receiverSessionID: sessionID,
                receiverActorID: actorID,
              }),
            ),
          ),
        )
        return
      }
      const actor = yield* registry.get(sessionID, actorID)
      if (!actor) {
        return yield* Effect.fail(
          new InboxReceiverNotFound({
            receiverSessionID: sessionID,
            receiverActorID: actorID,
          }),
        )
      }
    })

    const send = Effect.fn("Inbox.send")(function* (input: SendInput) {
      yield* ensureReceiver(input.receiverSessionID, input.receiverActorID)
      const row = {
        id: ulid(),
        receiver_session_id: input.receiverSessionID,
        receiver_actor_id: input.receiverActorID,
        sender_session_id: input.senderSessionID ?? null,
        sender_actor_id: input.senderActorID ?? null,
        type: input.type ?? "text",
        content: { text: input.content },
        created_at: Date.now(),
      }
      yield* db.insert(InboxTable).values(row).run().pipe(Effect.orDie)
      const promptRef = sessionPromptRef.current
      if (promptRef) {
        yield* promptRef
          .loop({ sessionID: input.receiverSessionID, agentID: input.receiverActorID })
          .pipe(Effect.ignore, Effect.forkIn(scope))
      }
      return { inboxID: row.id }
    })

    const list = Effect.fn("Inbox.list")(function* (sessionID: SessionID, actorID: string) {
      const rows = yield* db
        .select()
        .from(InboxTable)
        .where(and(eq(InboxTable.receiver_session_id, sessionID), eq(InboxTable.receiver_actor_id, actorID)))
        .orderBy(asc(InboxTable.id))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toMessage)
    })

    const drain = Effect.fn("Inbox.drain")(function* (sessionID: SessionID, actorID: string) {
      const rows = yield* db
        .select()
        .from(InboxTable)
        .where(and(eq(InboxTable.receiver_session_id, sessionID), eq(InboxTable.receiver_actor_id, actorID)))
        .orderBy(asc(InboxTable.id))
        .limit(MAX_DRAIN_PER_TURN)
        .all()
        .pipe(Effect.orDie)
      if (rows.length === 0) return 0

      const slice = yield* sessions.messages({ sessionID, agentID: actorID }).pipe(Effect.catch(() => Effect.succeed([])))
      const lastReal = slice.findLast(
        (message) =>
          (message.info.role === "user" || message.info.role === "assistant") &&
          "model" in message.info &&
          message.info.model !== undefined &&
          message.info.agent !== "system",
      )
      if (!lastReal || !("model" in lastReal.info) || !lastReal.info.model || !("agent" in lastReal.info)) return 0

      const msgID = MessageID.ascending()
      yield* sessions.updateMessage({
        id: msgID,
        role: "user" as const,
        sessionID,
        agentID: actorID,
        agent: lastReal.info.agent,
        model: lastReal.info.model,
        time: { created: Date.now() },
      })
      for (const row of rows) {
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: msgID,
          sessionID,
          type: "text" as const,
          synthetic: true,
          text: renderInboxMessage(toMessage(row)),
        })
      }
      yield* db.delete(InboxTable).where(inArray(InboxTable.id, rows.map((row) => row.id))).run().pipe(Effect.orDie)
      return rows.length
    })

    const impl = Service.of({ send, list, drain })
    inboxServiceRef.current = impl
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (inboxServiceRef.current === impl) inboxServiceRef.current = undefined
      }),
    )
    return impl
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(ActorRegistry.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Database.defaultLayer),
)

export const node = LayerNode.make(layer, [ActorRegistry.node, Session.node, Database.node])

export * as Inbox from "./inbox"
