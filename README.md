<h1 align="center">SWUST Code</h1>

<p align="center"><strong>An open-source AI coding agent with persistent memory, goal-driven autonomy, and self-improvement.</strong></p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

---

SWUST Code is a terminal-native AI coding agent. It can read and write code, run commands, manage Git, and use a persistent memory system to keep a deep understanding of your project across sessions while continuously improving itself.

SWUST Code supports connecting to any mainstream LLM provider API via the Vercel AI SDK.

---

## Quick Start

```bash
# Install via npm
npm install -g swust-code

# Or build from source
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code && bun install
bun run --cwd packages/opencode src/index.ts
```

The first launch guides you through configuration automatically. Supported options:
- **Anthropic** — Claude models via API key
- **OpenAI** — GPT models via API key
- **Custom Provider** — add any OpenAI-compatible API in the TUI

---

## Core Features

### Multiple Agents

| Agent | Description |
|-------|-------------|
| **build** | Default. Full tool permissions for development |
| **plan** | Read-only analysis mode for code exploration and solution design |
| **explore** | Fast read-only search agent for locating code |

Press `Tab` to switch between primary agents. Subagents are created by the system as needed.

### Persistent Memory

Cross-session memory powered by SQLite FTS5 full-text search:

- **Project memory** (`MEMORY.md`) — persistent project knowledge, rules, and architecture decisions
- **Global memory** (`global/MEMORY.md`) — cross-project user preferences
- **Session checkpoint** (`checkpoint.md`) — structured 11-section state snapshot with per-section token budgets
- **Session notes** (`notes.md`) — temporary scratchpad for agents

Memory is injected automatically when a session resumes, so the agent does not need to relearn project context. Two tools are available:
- `memory` — search persistent knowledge (FTS5 + BM25 ranking)
- `memory_write` — write structured knowledge to memory files

### Goal-Driven Autonomy

The `--goal` flag sets a stopping condition for a session:

```bash
swust-code run --goal "fix all TypeScript errors" "start working"
```

When the agent tries to stop, an independent judge model evaluates the conversation to decide whether the condition is truly satisfied — preventing premature stops during autonomous work. Re-entry is capped at 12 attempts per goal.

### Dream & Distill

- **`swust-code dream`** — scans recent session traces, extracts persistent knowledge into project memory, and removes outdated entries (auto-triggers every 7 days)
- **`swust-code distill`** — discovers repeated manual workflows in recent work and packages high-confidence candidates into reusable skills (auto-triggers every 30 days)

### Subagent System

The primary agent can create subagents on demand. Subagents share the current session context and can work in parallel, with lifecycle tracking, cancellation, and background execution. Two spawn modes:
- **peer** — creates a new child session (full isolation)
- **subagent** — shares the parent session context (distinct actorID)

### Workflow Engine

Scriptable multi-agent orchestration with crash recovery. Workflows are JavaScript scripts that run in a sandboxed environment and can spawn agents, run tasks in parallel, and compose results. Built-in workflow: Deep Research (6-phase pipeline with adversarial fact-checking).

### Security

4-step permission pipeline with bash command safety analysis:

1. Blanket deny rules — immediate block
2. Blanket ask rules — prompt user
3. Tool-specific `checkPermissions()` — per tool
4. Mode override — bypass / acceptEdits / dontAsk / auto

Bash safety analyzer detects dangerous patterns (rm -rf, fork bomb, eval, chmod 777, curl|sh, etc.) and blocks them before execution.

### Skills System

Create custom skills in `.swust-code/skills/<name>/SKILL.md`:

```markdown
---
name: code-review
description: Review code changes for correctness and style
---

# Instructions...
```

Skills are automatically discovered from multiple sources and conditionally activated based on file paths.

---

## Configuration

SWUST Code is configured via `.swust-code/config.json` in the project directory (or `~/.config/swust-code/config.json` globally). Key options include:

- Provider and model selection
- Agent permissions
- Memory behavior
- MCP server connections
- Keybindings and theme

---

## Development

```bash
bun install              # Install dependencies
bun run dev              # Run in development mode
bun turbo typecheck      # Type check
bun turbo test           # Run tests
```

---

## Relationship to OpenCode

SWUST Code is built as a fork of [OpenCode](https://github.com/anomalyco/opencode). It keeps all core OpenCode capabilities (multiple providers, TUI, LSP, MCP, plugins) and adds persistent memory, goal-driven autonomy, self-improvement via dream/distill, multi-agent orchestration, workflow engine, and layered security.

Key patterns ported from:
- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) — Memory system, Dream/Distill, Actor/Spawn, Workflow engine
- [DevEco Code](https://github.com/nicognaW/deveco-code) — NAPI bridge, Workspace adapter, Document validation

---

## License

Source code is licensed under the [MIT License](./LICENSE).
