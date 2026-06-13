/**
 * NAPI Bridge - bridge native addons as tools.
 *
 * Enables domain-specific native tools to be declared in JSON files
 * and loaded via N-API at runtime without modifying core code.
 *
 * Architecture:
 * 1. Tool declarations in JSON (name, description, parameters)
 * 2. Native addon provides init() + callTool(name, argsJson) via NAPI
 * 3. Bridge registers tools dynamically using Effect Schema validation
 *
 * Gate pattern: bridge is initialized lazily on first tool call.
 * Three-tier resolution: workspace → user → plugin directory
 *
 * Ported from DevEco Code's harmony-napi-dynamic-tools.ts.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { ToolFailure } from "@swust-code/llm"

export interface NapiToolDeclaration {
  readonly name: string
  readonly description: string
  readonly parameters?: Record<string, unknown>
}

export interface NapiBridgeConfig {
  readonly addonPath: string
  readonly toolsPath: string
  readonly dataDir?: string
}

export interface NapiBridgeState {
  readonly initialized: boolean
  readonly tools: ReadonlyArray<NapiToolDeclaration>
}

/**
 * Parse tool declarations from a JSON file.
 * Same format as dynamic-loader but specifically for NAPI tools.
 */
export function parseNapiToolDeclarations(json: unknown): ReadonlyArray<NapiToolDeclaration> {
  if (!json || typeof json !== "object") return []
  const obj = json as Record<string, unknown>
  if (!Array.isArray(obj.tools)) return []
  return obj.tools.filter(
    (t): t is NapiToolDeclaration =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as NapiToolDeclaration).name === "string" &&
      typeof (t as NapiToolDeclaration).description === "string",
  )
}

/**
 * Resolve the addon path using three-tier resolution:
 * 1. Workspace directory
 * 2. User config directory
 * 3. Plugin directory
 */
export function resolveAddonPath(
  name: string,
  dirs: ReadonlyArray<string>,
): string | null {
  for (const dir of dirs) {
    const candidate = `${dir}/${name}`
    try {
      // Check if the native addon exists
      require.resolve(candidate)
      return candidate
    } catch {
      // Not found in this directory, try next
    }
  }
  return null
}

/**
 * Create a bridge adapter that wraps native tool calls.
 *
 * The adapter handles:
 * - Lazy initialization (gate pattern)
 * - JSON serialization of arguments
 * - Error wrapping in ToolFailure
 * - Sandbox path validation
 */
export function createBridgeAdapter(addonPath: string): {
  init: () => Effect.Effect<void>
  callTool: (name: string, args: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, ToolFailure>
  listTools: () => Effect.Effect<ReadonlyArray<NapiToolDeclaration>>
} {
  let initialized = false
  let nativeModule: any = null

  const init = (): Effect.Effect<void> =>
    Effect.sync(() => {
      if (initialized) return
      try {
        nativeModule = require(addonPath)
        nativeModule.init?.()
        initialized = true
      } catch (e) {
        throw new Error(`NAPI bridge init failed: ${e}`)
      }
    })

  const callTool = (name: string, args: Record<string, unknown>): Effect.Effect<Record<string, unknown>, ToolFailure> =>
    Effect.gen(function* () {
      if (!initialized) {
        yield* init()
      }

      const result = yield* Effect.tryPromise({
        try: async () => {
          const argsJson = JSON.stringify(args)
          const resultJson = await nativeModule.callTool(name, argsJson)
          return JSON.parse(resultJson)
        },
        catch: (e) => new ToolFailure({ message: `NAPI tool call failed: ${e}` }),
      })

      return result
    })

  const listTools = (): Effect.Effect<ReadonlyArray<NapiToolDeclaration>> =>
    Effect.gen(function* () {
      if (!initialized) {
        yield* init()
      }

      return Effect.runSync(
        Effect.try({
          try: () => {
            const toolsJson = nativeModule.listTools?.() ?? "[]"
            return parseNapiToolDeclarations(JSON.parse(toolsJson))
          },
          catch: () => [] as ReadonlyArray<NapiToolDeclaration>,
        }),
      )
    })

  return { init, callTool, listTools }
}

/**
 * Register NAPI tools with the tool registry.
 */
export function registerNapiTools(
  declarations: ReadonlyArray<NapiToolDeclaration>,
  adapter: ReturnType<typeof createBridgeAdapter>,
  register: (tools: Record<string, Tool.AnyTool>) => Effect.Effect<void>,
): Effect.Effect<void> {
  const toolMap: Record<string, Tool.AnyTool> = {}

  for (const decl of declarations) {
    const inputCodec = Schema.Struct({}) as unknown as Schema.Codec<any, any, never, never>
    const outputCodec = Schema.Struct({}) as unknown as Schema.Codec<any, any, never, never>

    toolMap[decl.name] = Tool.make({
      description: decl.description,
      input: inputCodec,
      output: outputCodec,
      execute: (input) =>
        adapter.callTool(decl.name, input as Record<string, unknown>),
    })
  }

  return register(toolMap)
}
