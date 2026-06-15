import type { InboxMessage } from "./inbox"

export function renderInboxMessage(row: InboxMessage): string {
  if (row.type === "actor_notification") return row.content
  const sender = row.senderSessionID ? `${row.senderSessionID}:${row.senderActorID ?? "?"}` : "system"
  return `<inbox from="${sender}" sent_at="${new Date(row.createdAt).toISOString()}">\n${row.content}\n</inbox>`
}

