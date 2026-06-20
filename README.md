<h1 align="center">SWUST Code</h1>

<p align="center">
  <strong>龙山灵码 · A terminal-native AI coding agent built on MiMo-Code</strong>
</p>

<p align="center">
  <a href="README.zh.md">中文</a> · English ·
  <a href="https://swust-code.dev">Documentation</a> ·
  <a href="https://github.com/MakeBlackSheepGreat/swust-code">GitHub</a>
</p>

<p align="center">
  <a href="https://swust-code.dev"><img src="https://img.shields.io/badge/docs-live-1d4ed8?style=flat-square" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748b?style=flat-square" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=flat-square&color=0f766e" alt="Stars"></a>
  <img src="https://img.shields.io/badge/version-0.6.0-2563eb?style=flat-square" alt="Version">
</p>

> [!IMPORTANT]
> SWUST Code is a MiMo-Code based fork. The rule is simple: when MiMo-Code already provides a capability, SWUST Code keeps the MiMo implementation first; when MiMo-Code does not provide it, SWUST Code layers the SWUST-specific implementation on top.

## What It Is

SWUST Code is a terminal-native AI coding agent for long-running software work. It can read and edit code, run commands, manage sessions, use MCP/LSP/plugins, maintain persistent project memory, coordinate subagents, and keep working against explicit goals.

The Chinese product name is **龙山灵码**. The CLI command is:

```bash
swust-code
```

Provider names are intentionally not rebranded. `MiMo Auto`, `Xiaomi MiMo Platform`, `mimo/mimo-auto`, and `xiaomi/mimo-*` refer to the original provider services and model IDs.

## Quick Start

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/MakeBlackSheepGreat/swust-code/main/install | bash

# Or install via npm
npm install -g @swust-code/cli

# Start the TUI
swust-code
```

First launch opens a guided provider setup:

| Option | Use When |
|--------|----------|
| **MiMo Auto** | You want a zero-config free-for-limited-time channel |
| **Xiaomi MiMo Platform** | You want to sign in with MiMo OAuth |
| **Import from Claude Code** | You already have Claude Code credentials |
| **Custom Provider** | You use an OpenAI-compatible API gateway or vendor |

## Everyday Commands

| Command | Purpose |
|---------|---------|
| `swust-code` | Start the interactive TUI |
| `swust-code run "explain this repo"` | Run one prompt from the shell |
| `swust-code run --goal "fix type errors" "start"` | Run with an autonomous stop condition |
| `/goal <objective>` | Set a goal inside the TUI |
| `/memory <query>` | Search persistent project memory |
| `/dream` | Consolidate durable project knowledge from recent sessions |
| `/distill` | Turn repeated workflows into reusable skills, subagents, or commands |
| `/subagent`, `/subagents` | Configure visible subagents with project-level model, reasoning variant, and max-step overrides |
| `/paste-image` | Attach an image from the clipboard |
| `/model`, `/agent`, `/mcp`, `/skill`, `/effort` | Open existing MiMo/SWUST TUI controls via familiar aliases |

## Core Capabilities

### MiMo-Code Base

SWUST Code inherits MiMo-Code's current runtime foundation:

- terminal TUI, server runtime, web/desktop surfaces
- multi-provider model routing and OpenAI-compatible providers
- LSP, MCP, plugins, custom commands, skills
- persistent memory, checkpoints, context reconstruction
- actor/subagent orchestration and task tracking
- `goal`, `compose`, Dream/Distill, and voice input

### SWUST Layer

The SWUST layer focuses on product identity, Chinese-first usability, and engineering safeguards:

- 龙山灵码 branding and Chinese localization
- richer sidebar context for goal, task, todo, LSP, MCP, changed files, token, cost, and cache state
- project-level subagent settings for model, reasoning variant, and max execution steps
- attention notifications and sound-pack configuration
- task gate checks before agents stop with unfinished work
- bash command safety analysis
- document validation helpers
- cache-stable context layout
- `@path` memory imports and one-fact-per-file memory storage

## Agents

| Agent | Description |
|-------|-------------|
| **build** | Default development agent with full tool permissions |
| **plan** | Read-only exploration and solution design |
| **compose** | Structured orchestration for specs, skills, review, TDD, verification, and merge workflows |
| **goal** | Autonomous mode that keeps working until a judge says the stop condition is met |

Press `Tab` in the TUI to switch primary agents. The runtime can create subagents for investigation, implementation, review, and checkpoint writing while preserving parent-session context.

## Memory And Checkpoints

SWUST Code keeps useful project knowledge across sessions:

```text
~/.local/share/swust-code/memory/
  global/MEMORY.md
  projects/<project-id>/MEMORY.md
  projects/<project-id>/facts/<fact>.md
  sessions/<session-id>/checkpoint.md
  sessions/<session-id>/notes.md
  sessions/<session-id>/tasks/<task-id>/progress.md
```

Memory is searchable through SQLite FTS5 and reconstructed with checkpoint state when a session resumes or approaches the context limit. The result is less relearning and more continuity during long tasks.

## Configuration

Runtime configuration uses `swust-code.json` or `swust-code.jsonc`.

Common locations:

- Global runtime config: `~/.config/swust-code/swust-code.json`
- Project runtime config: `swust-code.json` in the project root
- Global TUI config: `~/.config/swust-code/tui.json`
- Project TUI config: `tui.json` in the project root

Configuration covers providers, models, permissions, agents, commands, MCP servers, plugins, memory/checkpoint behavior, keybindings, themes, and experimental features.

## Development

```bash
bun install
bun run dev
bun turbo typecheck
```

Package and runtime details:

| Item | Value |
|------|-------|
| npm package | `@swust-code/cli` |
| CLI binary | `swust-code` |
| Package manager | `bun@1.3.11` |
| Current declared version | `0.6.0` |

## Documentation

- **Docs site:** <https://swust-code.dev>
- **Quick start:** <https://swust-code.dev/guide/start>
- **Commands:** <https://swust-code.dev/api/commands>
- **Architecture:** <https://swust-code.dev/dev/architecture>

## Acknowledgments

SWUST Code builds on open-source work from:

- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) by Xiaomi, the current base for the runtime, TUI, provider, memory, checkpoint, actor, goal, Compose, Dream/Distill, voice, MCP, LSP, and plugin stack.
- [OpenCode](https://github.com/anomalyco/opencode), important upstream heritage for terminal-native coding agents.
- [DevEco Code](https://github.com/nicognaW/deveco-code), reference for document validation ideas.
- [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix), reference for cache-stable context and memory organization ideas.

## License

Source code is licensed under the [MIT License](./LICENSE).

Use of SWUST Code is also subject to the [Use Restrictions](./USE_RESTRICTIONS.md). Use of Xiaomi MiMo-hosted services is subject to the [MiMo Terms of Service](https://platform.xiaomimimo.com/docs/terms/user-agreement). Use of the MiMo name, logo, and trademarks is subject to the MiMo Trademark Policy.
