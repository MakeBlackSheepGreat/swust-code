export * as MemoryWriteTool from "./memory-write"

import { ToolFailure } from "@swust-code/llm"
import { Effect, Layer, Schema } from "effect"
import { Memory } from "../memory"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory_write"

export const Input = Schema.Struct({
  scope: Schema.Literals(["global", "projects", "sessions"]).annotate({
    description: "Memory scope: global (cross-project), projects (project-specific), sessions (session-specific)",
  }),
  scopeId: Schema.String.annotate({
    description: "Scope identifier: project ID hash for projects, session ID for sessions, empty string for global",
  }),
  key: Schema.String.annotate({
    description: "Filename (e.g., 'MEMORY.md', 'notes.md', 'architecture.md'). Must end with .md or .txt",
  }),
  content: Schema.String.annotate({
    description: "Markdown content to write",
  }),
  mode: Schema.optional(Schema.Literals(["overwrite", "append"])).annotate({
    description: "Write mode: overwrite (default) or append to existing file",
  }),
})

export const Output = Schema.Struct({
  path: Schema.String,
  bytesWritten: Schema.Number,
})
export type Output = typeof Output.Type

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const memory = yield* Memory.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: [
            "Write content to persistent project memory files.",
            "Memory files persist across sessions as markdown.",
            "Use scope='projects' with scopeId=<project_hash> for project-specific knowledge.",
            "Use scope='global' with scopeId='' for cross-project preferences.",
            "Use 'append' mode to add to existing files without overwriting.",
          ].join(" "),
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [
            { type: "text", text: `Wrote ${output.bytesWritten} bytes to ${output.path}` },
          ],
          execute: (input, _context) =>
            Effect.gen(function* () {
              if (!input.key.endsWith(".md") && !input.key.endsWith(".txt")) {
                return yield* Effect.fail(
                  new ToolFailure({ message: "Key must end with .md or .txt" }),
                )
              }

              const writtenPath = yield* memory.write({
                scope: input.scope,
                scopeId: input.scopeId,
                key: input.key,
                content: input.content,
                mode: input.mode,
              })

              return {
                path: writtenPath,
                bytesWritten: new TextEncoder().encode(input.content).length,
              }
            }).pipe(
              Effect.mapError((e) => new ToolFailure({ message: `Memory write failed: ${e}` })),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)
