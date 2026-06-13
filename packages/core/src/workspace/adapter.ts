/**
 * Workspace Adapter - pluggable workspace routing.
 *
 * Supports local (directory-based) and remote (HTTP-based) workspaces
 * through a strategy pattern with project-scoped registries.
 *
 * Pattern from DevEco Code's control-plane/workspace system.
 *
 * Adapters implement: configure → create → target → remove
 * The target() return value determines routing:
 *   - { type: "local", directory } → InstanceStore
 *   - { type: "remote", url, headers? } → HTTP
 */

import { Context, Effect, Layer } from "effect"
import { Global } from "../global"

export type Target =
  | { readonly type: "local"; readonly directory: string }
  | { readonly type: "remote"; readonly url: string; readonly headers?: Record<string, string> }

export interface WorkspaceInfo {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly directory: string
  readonly branch?: string
  readonly projectID: string
}

export interface WorkspaceAdapter {
  readonly name: string
  readonly description: string
  configure(info: WorkspaceInfo): WorkspaceInfo | Promise<WorkspaceInfo>
  create(info: WorkspaceInfo, env: Record<string, string | undefined>): Promise<void>
  remove(info: WorkspaceInfo): Promise<void>
  target(info: WorkspaceInfo): Target | Promise<Target>
}

// Built-in worktree adapter
const WorktreeAdapter: WorkspaceAdapter = {
  name: "Worktree",
  description: "Local git worktree workspace",
  configure: (info) => info,
  create: async (_info) => {
    // In full implementation: git worktree add
  },
  remove: async (_info) => {
    // In full implementation: git worktree remove
  },
  target: (info) => ({ type: "local", directory: info.directory }),
}

const BUILTIN_ADAPTERS: Record<string, WorkspaceAdapter> = {
  worktree: WorktreeAdapter,
}

export interface Interface {
  readonly getAdapter: (projectID: string, type: string) => WorkspaceAdapter
  readonly registerAdapter: (projectID: string, type: string, adapter: WorkspaceAdapter) => void
  readonly listAdapters: (projectID: string) => ReadonlyArray<{ type: string; name: string; description: string }>
  readonly resolve: (info: WorkspaceInfo) => Effect.Effect<Target>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/WorkspaceAdapter") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const customAdapters = new Map<string, Map<string, WorkspaceAdapter>>()

    const getAdapter = (projectID: string, type: string): WorkspaceAdapter => {
      // Check custom (project-scoped) first
      const projectAdapters = customAdapters.get(projectID)
      if (projectAdapters?.has(type)) {
        return projectAdapters.get(type)!
      }
      // Fall back to builtin
      if (BUILTIN_ADAPTERS[type]) {
        return BUILTIN_ADAPTERS[type]
      }
      throw new Error(`Workspace adapter not found: ${type} (project: ${projectID})`)
    }

    const registerAdapter = (projectID: string, type: string, adapter: WorkspaceAdapter): void => {
      if (!customAdapters.has(projectID)) {
        customAdapters.set(projectID, new Map())
      }
      customAdapters.get(projectID)!.set(type, adapter)
    }

    const listAdapters = (projectID: string): ReadonlyArray<{ type: string; name: string; description: string }> => {
      const result: Array<{ type: string; name: string; description: string }> = []

      // Builtins
      for (const [type, adapter] of Object.entries(BUILTIN_ADAPTERS)) {
        result.push({ type, name: adapter.name, description: adapter.description })
      }

      // Custom
      const projectAdapters = customAdapters.get(projectID)
      if (projectAdapters) {
        for (const [type, adapter] of projectAdapters) {
          result.push({ type, name: adapter.name, description: adapter.description })
        }
      }

      return result
    }

    const resolve = (info: WorkspaceInfo): Effect.Effect<Target> =>
      Effect.tryPromise({
        try: async () => {
          const adapter = getAdapter(info.projectID, info.type)
          const configured = await adapter.configure(info)
          return await adapter.target(configured)
        },
        catch: (e) => new Error(`Workspace resolve failed: ${e}`),
      }).pipe(Effect.catch(() => Effect.succeed({ type: "local" as const, directory: info.directory })))

    return Service.of({ getAdapter, registerAdapter, listAdapters, resolve })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Global.defaultLayer))
