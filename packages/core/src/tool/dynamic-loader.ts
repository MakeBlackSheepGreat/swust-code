/**
 * Dynamic Tool Loader - register tools from JSON declarations.
 *
 * Enables domain-specific tools to be declared in JSON files
 * and loaded at runtime without modifying core code.
 *
 * Pattern from DevEco Code's harmony-napi-dynamic-tools.ts.
 */

import { Effect, Schema } from "effect"
import { Tool } from "./tool"
import { ToolFailure } from "@swust-code/llm"

export interface JsonToolDeclaration {
  readonly name: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
  readonly isReadOnly?: boolean
  readonly isDestructive?: boolean
}

export interface JsonToolFile {
  readonly tools: ReadonlyArray<JsonToolDeclaration>
}

export type ToolHandler = (
  input: Record<string, unknown>,
) => Effect.Effect<Record<string, unknown>, ToolFailure>

/**
 * Parse a JSON tool file and validate its structure.
 */
export function parseToolDeclarations(json: unknown): ReadonlyArray<JsonToolDeclaration> {
  if (!json || typeof json !== "object") return []
  const obj = json as Record<string, unknown>
  if (!Array.isArray(obj.tools)) return []
  return obj.tools.filter(
    (t): t is JsonToolDeclaration =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as JsonToolDeclaration).name === "string" &&
      typeof (t as JsonToolDeclaration).description === "string",
  )
}

/**
 * Create a Tool.AnyTool from a JSON declaration and handler.
 */
export function createJsonTool(decl: JsonToolDeclaration, handler: ToolHandler): Tool.AnyTool {
  const inputCodec = Schema.Struct({}) as unknown as Schema.Codec<any, any, never, never>
  const outputCodec = Schema.Struct({}) as unknown as Schema.Codec<any, any, never, never>

  return Tool.make({
    description: decl.description,
    input: inputCodec,
    output: outputCodec,
    isReadOnly: decl.isReadOnly,
    isDestructive: decl.isDestructive,
    execute: (input) =>
      handler(input as Record<string, unknown>).pipe(
        Effect.mapError((e) => new ToolFailure({ message: String(e) })),
      ),
  })
}

/**
 * Path traversal guard for tool file paths.
 */
export function sanitizeFilePath(filePath: string, allowedDir: string): string | null {
  const path = require("path")
  const resolved = path.resolve(allowedDir, filePath)
  const normalizedAllowed = path.resolve(allowedDir)
  if (!resolved.startsWith(normalizedAllowed + path.sep) && resolved !== normalizedAllowed) {
    return null
  }
  return resolved
}
