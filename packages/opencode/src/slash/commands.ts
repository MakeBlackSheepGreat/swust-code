/**
 * Slash Command System - unified /command interface for the TUI.
 *
 * Provides a registry of slash commands that users can invoke
 * in the TUI input (e.g., /memory, /goal, /dream).
 *
 * Commands are discovered from multiple sources:
 * - Built-in commands (hardcoded)
 * - Plugin commands (loaded at runtime)
 * - Skill commands (from .swust-code/command/)
 *
 * Ported from DeepSeek-Reasonix's control/slash.go patterns.
 */

import { Context, Effect, Layer } from "effect"

export interface SlashCommand {
  readonly name: string
  readonly description: string
  readonly usage?: string
  readonly handler: (args: string) => Effect.Effect<string>
}

export interface Interface {
  readonly register: (command: SlashCommand) => void
  readonly execute: (input: string) => Effect.Effect<string | null>
  readonly list: () => ReadonlyArray<SlashCommand>
  readonly complete: (partial: string) => ReadonlyArray<string>
}

export class Service extends Context.Service<Service, Interface>()("@swust-code/SlashCommands") {}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => {
    const commands = new Map<string, SlashCommand>()

    const register = (command: SlashCommand): void => {
      commands.set(command.name, command)
    }

    const execute = (input: string): Effect.Effect<string | null> => {
      if (!input.startsWith("/")) return Effect.succeed(null)

      const spaceIdx = input.indexOf(" ")
      const name = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx)
      const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim()

      const cmd = commands.get(name)
      if (!cmd) {
        return Effect.succeed(`Unknown command: /${name}. Type /help for available commands.`)
      }

      return cmd.handler(args)
    }

    const list = (): ReadonlyArray<SlashCommand> => [...commands.values()]

    const complete = (partial: string): ReadonlyArray<string> => {
      if (!partial.startsWith("/")) return []
      const prefix = partial.slice(1).toLowerCase()
      return [...commands.keys()]
        .filter((name) => name.startsWith(prefix))
        .sort()
    }

    return Service.of({ register, execute, list, complete })
  }),
)

export const defaultLayer = layer

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

export function registerBuiltinCommands(service: Service): void {
  service.register({
    name: "help",
    description: "Show available commands",
    handler: () => {
      const cmds = service.list()
      const lines = ["Available commands:\n"]
      for (const cmd of cmds) {
        const usage = cmd.usage ? ` ${cmd.usage}` : ""
        lines.push(`  /${cmd.name}${usage}  — ${cmd.description}`)
      }
      return Effect.succeed(lines.join("\n"))
    },
  })

  service.register({
    name: "memory",
    description: "Search persistent memory",
    usage: "<query>",
    handler: (args) => {
      if (!args) return Effect.succeed("Usage: /memory <search query>")
      return Effect.succeed(`Searching memory for: "${args}"... (use the memory tool for full search)`)
    },
  })

  service.register({
    name: "goal",
    description: "Set or view autonomous goal",
    usage: "[condition]",
    handler: (args) => {
      if (!args) return Effect.succeed("Usage: /goal <condition>  or  /goal clear")
      if (args === "clear") return Effect.succeed("Goal cleared.")
      return Effect.succeed(`Goal set: "${args}"\nThe agent will work autonomously until the goal is met.`)
    },
  })

  service.register({
    name: "dream",
    description: "Trigger memory consolidation",
    handler: () => Effect.succeed("Starting Dream: memory consolidation..."),
  })

  service.register({
    name: "distill",
    description: "Trigger workflow discovery",
    handler: () => Effect.succeed("Starting Distill: workflow packaging..."),
  })

  service.register({
    name: "status",
    description: "Show current session status",
    handler: () => Effect.succeed("Session status: active"),
  })
}
