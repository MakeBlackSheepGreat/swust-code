import { Schema } from "effect"
import { SessionID } from "@/session/schema"

export const TaskID = Schema.String.check(Schema.isPattern(/^T\d+(\.\d+)*$/)).pipe(Schema.brand("TaskID"))
export type TaskID = Schema.Schema.Type<typeof TaskID>

export const TaskStatus = Schema.Literals(["open", "in_progress", "blocked", "done", "abandoned"])
export type TaskStatus = Schema.Schema.Type<typeof TaskStatus>

export const Task = Schema.Struct({
  id: TaskID,
  session_id: SessionID,
  parent_task_id: Schema.optional(TaskID),
  status: TaskStatus,
  summary: Schema.String,
  owner: Schema.optional(Schema.String),
  created_at: Schema.Number,
  last_event_at: Schema.Number,
  ended_at: Schema.optional(Schema.Number),
  cleanup_after: Schema.optional(Schema.Number),
})
export type Task = Schema.Schema.Type<typeof Task>

export const TaskEventKind = Schema.Literals([
  "created",
  "started",
  "unstarted",
  "blocked",
  "unblocked",
  "done",
  "abandoned",
  "renamed",
])
export type TaskEventKind = Schema.Schema.Type<typeof TaskEventKind>

export const TaskEvent = Schema.Struct({
  id: Schema.Number,
  task_id: TaskID,
  at: Schema.Number,
  kind: TaskEventKind,
  summary: Schema.optional(Schema.String),
})
export type TaskEvent = Schema.Schema.Type<typeof TaskEvent>
