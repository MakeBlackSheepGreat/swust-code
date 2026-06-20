<h1 align="center">SWUST Code</h1>

<p align="center">
  <img src="assets/readme/swust-code-banner.png" alt="SWUST Code" width="700">
</p>

<p align="center">
  <strong>SWUST Code: Where Models and Agents Co-Evolve</strong>
</p>

<p align="center">
  Official Chinese name: <strong>龙山灵码</strong>
</p>

<p align="center">
  <a href="https://swust-code.dev"><img src="https://img.shields.io/badge/docs-live-brightgreen" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

---

SWUST Code, officially named 龙山灵码 in Chinese, is a terminal-native AI coding agent built as a fork of [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code). It keeps MiMo-Code's native foundation first: multi-provider model routing, TUI, LSP, MCP, plugins, persistent memory, checkpoints, actor/subagent orchestration, task tracking, goal stop conditions, Compose workflows, Dream/Distill self-improvement, and voice input.

On top of that foundation, SWUST Code adds the SWUST brand layer, Chinese-first product polish, richer sidebar context, attention notifications, task completion gates, document validation, cache-stable context optimization, `@path` memory imports, and one-fact-per-file memory storage.

> **[Read the documentation](https://swust-code.dev/docs/)** — installation, configuration, providers, TUI, agents, permissions, MCP, plugins, and developer guides.

---

## Project Positioning

This fork follows a simple rule: **when MiMo-Code already provides a capability, SWUST Code tracks MiMo-Code behavior first; when a capability is missing from MiMo-Code, SWUST Code layers the SWUST-specific implementation on top.**

| Layer | What it provides |
|-------|------------------|
| **MiMo-Code base** | Provider integration, TUI/server runtime, LSP, MCP, plugins, memory, checkpoints, actor/subagent runtime, tasks, goal, Compose, Dream/Distill, voice |
| **SWUST layer** | 龙山灵码 branding, Chinese localization, SWUST sidebar/attention UX, task gate policy, document validation, memory import/fact-store utilities, cache-stable prompt layout |
| **Compatibility layer** | OpenAI-compatible providers, MiMo voice model configuration, Claude Code auth import, project/global config files |

AI provider names are intentionally preserved. `MiMo Auto`, `Xiaomi MiMo Platform`, `mimo/mimo-auto`, and `xiaomi/mimo-*` model IDs refer to the original provider services and are not rebranded.

---

## Quick Start

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/MakeBlackSheepGreat/swust-code/main/install | bash

# Or install via npm
npm install -g @swust-code/cli

# Run
swust-code
```

The first launch guides you through configuration automatically:

- **MiMo Auto (free for a limited time)** — anonymous channel, zero configuration
- **Xiaomi MiMo Platform** — OAuth login
- **Import from Claude Code** — migrate existing authentication in one step
- **Custom Provider** — add any OpenAI-compatible API in the TUI

<details>
<summary><strong>WSL: clipboard issues</strong></summary>

If copied text is garbled on WSL, install `xsel`:

```bash
sudo apt install xsel
```

</details>

---

## Core Features

### Agents

| Agent | Description |
|-------|-------------|
| **build** | Default development agent with full tool permissions |
| **plan** | Read-only analysis mode for code exploration and solution design |
| **compose** | Structured orchestration mode for specs-driven and skill-driven workflows |
| **goal** | Autonomous mode that keeps working until the request is completed, verified, or blocked |

Press `Tab` to switch between primary agents. The runtime can create subagents as needed, track their lifecycle, cancel them, run them in the background, and keep their work connected to the parent session.

### Memory & Checkpoints

Persistent memory is backed by SQLite FTS5 search and MiMo-Code's checkpoint stack:

- **Project memory** (`MEMORY.md`) — project knowledge, rules, and architecture decisions
- **Session checkpoint** (`checkpoint.md`) — structured state snapshots maintained automatically
- **Scratch notes** (`notes.md`) — temporary agent notes
- **Task progress** (`tasks/<id>/progress.md`) — per-task execution logs
- **Fact store** — one-fact-per-file markdown storage with frontmatter and generated indexes
- **`@path` imports** — inline file references for memory documents

When a session resumes or approaches the context limit, SWUST Code reconstructs useful context from checkpoints, memory, notes, task progress, and recent conversation state instead of forcing the agent to relearn the project.

### Goal & Task Gates

`/goal` sets an autonomous stopping condition for the current session. When the agent tries to stop, an independent judge model evaluates whether the goal is actually satisfied. Task gates add a second safeguard by checking unfinished task state before allowing a main agent or eligible subagent to finish.

### Compose Workflows

Compose mode inherits MiMo-Code's structured development workflow: planning, implementation, review, TDD, debugging, verification, and merging can be coordinated through built-in skills and subagents.

### TUI Sidebar & Attention

The SWUST TUI keeps the MiMo/OpenTUI terminal experience and adds a more operational sidebar:

- working directory and instruction file visibility
- goal, task, todo, LSP, MCP, and changed-file sections
- context window health, token usage, runtime status, cost, and cache metrics
- getting-started prompts for free models and provider setup
- configurable attention notifications and sound packs

### Safety & Validation

SWUST Code keeps the provider/tool permission model and adds stricter guardrails where the fork needs them:

- task gate checks for unfinished work
- bash command safety analysis before risky execution paths
- document validation helpers for spec-driven files
- write-path guardrails for memory-related writes
- cache-stable prompt prefixes to improve provider cache hit rates

### Voice Input

Real-time streaming voice input is powered by TenVAD and MiMo ASR. Activate it with `/voice`; audio is segmented by pauses and transcribed incrementally into the input. MiMo-hosted ASR requires MiMo login and `sox` (`brew install sox` on macOS, equivalent package on other platforms).

<details>
<summary><strong>WSLg audio setup</strong></summary>

```bash
sudo apt install -y sox pulseaudio libasound2-plugins
export PULSE_SERVER=unix:/mnt/wslg/PulseServer
```

</details>

<details>
<summary><strong>SSH remote audio (Mac -> remote host)</strong></summary>

```bash
# Mac (local)
brew install pulseaudio
pulseaudio --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1" --exit-idle-time=-1 --daemonize
# Add to ~/.ssh/config: RemoteForward 4713 127.0.0.1:4713

# Remote host
apt install -y pulseaudio pulseaudio-utils sox
export PULSE_SERVER=tcp:127.0.0.1:4713
# Verify: pactl info
```

</details>

<details>
<summary><strong>Non-MiMo voice providers (OpenRouter, internal API, etc.)</strong></summary>

Voice input can route through other OpenAI-compatible providers via the `voice` config field. The ASR model (`mimo-v2.5-asr`) is only available on MiMo's platform; voice control mode (`mimo-v2.5`) is available on OpenRouter and compatible relay platforms.

**OpenRouter (voice control only):**

Use `/connect` to sign in to OpenRouter, then add:

```jsonc
{
  "voice": {
    "control_model": "openrouter/xiaomi/mimo-v2.5"
  }
}
```

**Internal / self-hosted relay (ASR + voice control):**

```jsonc
{
  "provider": {
    "internal": {
      "options": {
        "baseURL": "https://your-api-gateway.example.com/v1",
        "apiKey": "sk-..."
      },
      "models": {
        "xiaomi/mimo-v2.5-asr": { "name": "MiMo-V2.5-ASR" },
        "xiaomi/mimo-v2.5": { "name": "MiMo-V2.5" }
      }
    }
  },
  "voice": {
    "asr_model": "internal/xiaomi/mimo-v2.5-asr",
    "control_model": "internal/xiaomi/mimo-v2.5"
  }
}
```

Custom providers must register at least one model in their `models` field to be recognized. The model names in `voice.*_model` are sent directly to the API and do not need to match the registered model keys exactly.

</details>

### Dream & Distill

- **`/dream`** — scans recent session traces, extracts durable knowledge into project memory, and removes outdated entries
- **`/distill`** — discovers repeated workflows and packages high-confidence candidates into reusable skills, subagents, or commands

---

## Configuration

SWUST Code uses `swust-code.json` / `swust-code.jsonc` for runtime configuration and `tui.json` / `tui.jsonc` for TUI-specific settings.

Common locations:

- Global runtime config: `~/.config/swust-code/swust-code.json`
- Global TUI config: `~/.config/swust-code/tui.json`
- Project runtime config: `swust-code.json` in the project root
- Project TUI config: `tui.json` in the project root

Key configuration areas include providers, models, permissions, agents, commands, MCP servers, plugins, memory/checkpoint behavior, keybindings, themes, and experimental features such as Max Mode.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                  CLI / TUI / Web / Desktop               │
├──────────────────────────────────────────────────────────┤
│                    Session Runtime                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │ Memory      │ │ Checkpoint  │ │ Goal / Task Gates   │ │
│  │ Context     │ │ Compaction  │ │ Compose / Actors    │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│        Tools / Permissions / MCP / LSP / Plugins          │
├──────────────────────────────────────────────────────────┤
│        SQLite FTS5 + Drizzle ORM + Effect-TS + Bun        │
└──────────────────────────────────────────────────────────┘
```

| Area | Technology |
|------|------------|
| Runtime | Bun 1.3.11 |
| Effect system | Effect-TS 4 beta |
| Database | SQLite + Drizzle ORM + FTS5 |
| LLM integration | Vercel AI SDK and OpenAI-compatible providers |
| Terminal UI | SolidJS + OpenTUI |
| Monorepo | Bun workspaces + Turborepo |

---

## Development

```bash
bun install              # Install dependencies
bun run dev              # Run the CLI in development mode
bun turbo typecheck      # Type check all packages
```

Package and command names:

- npm package: `@swust-code/cli`
- CLI binary: `swust-code`
- repo package manager: `bun@1.3.11`

---

## Documentation

Documentation is available at **[swust-code.dev/docs](https://swust-code.dev/docs/)**.

---

## Community

Scan the QR code to join the community group chat:

<p align="center">
  <img src="assets/readme/community-qrcode.jpg" alt="Community group chat QR code" width="240">
</p>

---

## Acknowledgments

SWUST Code is built on open-source work from several projects:

- [**MiMo-Code**](https://github.com/XiaomiMiMo/MiMo-Code) by Xiaomi — the current base of this fork and the source of the native memory, checkpoint, actor, goal, Compose, Dream/Distill, voice, TUI, provider, MCP, LSP, and plugin stack.
- [**OpenCode**](https://github.com/anomalyco/opencode) by Anomaly Co. — important upstream heritage in the broader terminal-native coding agent ecosystem.
- [**DevEco Code**](https://github.com/nicognaW/deveco-code) by nicognaW — reference for document validation ideas used by the SWUST layer.
- [**DeepSeek-Reasonix**](https://github.com/esengine/DeepSeek-Reasonix) by esengine — reference for cache-stable context and memory organization ideas used by the SWUST layer.

We are grateful to the maintainers and contributors of these projects for making their work available under open-source licenses.

---

## License

Source code is licensed under the [MIT License](./LICENSE).

Use of SWUST Code is also subject to the [Use Restrictions](./USE_RESTRICTIONS.md). Use of Xiaomi MiMo-hosted services is subject to the [MiMo Terms of Service](https://platform.xiaomimimo.com/docs/terms/user-agreement). Use of the MiMo name, logo, and trademarks is subject to the MiMo Trademark Policy.
