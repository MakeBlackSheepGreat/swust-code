import { EventV2 } from "@swust-code/core/event"
import { SessionID } from "@/session/schema"
import { Schema } from "effect"
import { Task, TaskEventKind } from "./schema"

export const Created = EventV2.define({
  type: "task.created",
  schema: {
    sessionID: SessionID,
    task: Task,
  },
})

export const UpdatedKind = Schema.Literals(["started", "unstarted", "blocked", "unblocked", "done", "abandoned", "renamed"])
export type UpdatedKind = Schema.Schema.Type<typeof UpdatedKind>

export const Updated = EventV2.define({
  type: "task.updated",
  schema: {
    sessionID: SessionID,
    task: Task,
    kind: UpdatedKind,
  },
})

void TaskEventKind
