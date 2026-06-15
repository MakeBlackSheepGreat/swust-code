<h1 align="center">SWUST Code</h1>

<p align="center">
  <strong>An open-source AI coding agent with persistent memory, goal-driven autonomy, and self-improvement.</strong>
</p>

<p align="center">
  <a href="https://swust-code-docs.pages.dev"><img src="https://img.shields.io/badge/docs-live-brightgreen" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

---

SWUST Code is built on top of [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co., with key capabilities ported from [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) by Xiaomi, [DevEco Code](https://github.com/nicognaW/deveco-code) by nicognaW, and [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) by esengine. It keeps all core OpenCode capabilities (multiple providers, TUI, LSP, MCP, plugins) and adds persistent memory, goal-driven autonomy, self-improvement, multi-agent orchestration, workflow engine, layered security, and cache-first architecture.

From MiMo-Code we ported: persistent memory and raw history search (FTS5), Dream/Distill self-improvement, Compose skills, Actor/Spawn-compatible subagent orchestration, checkpoint system, context compaction, workflow engine, retry strategy, and doom loop detection.

From DevEco Code we ported: NAPI bridge for native tool loading, workspace adapter pattern, document validation system, and tool output pruning.

From DeepSeek-Reasonix we ported: cache-stable prefix architecture, `@path` import directive for memory files, one-fact-per-file memory store with frontmatter, and slash command system.

> **[Read the full documentation](https://swust-code-docs.pages.dev)** — installation, configuration, features, API reference, and developer guides.

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
- **Google** — Gemini models via API key
- **Custom Provider** — add any OpenAI-compatible API in the TUI

---

## Core Features

### Version 0.3 Focus

SWUST Code 0.3 adds two primary agent modes plus MiMo-compatible actor, memory, and history tool entrypoints:

- **compose** — a primary orchestration agent that injects MiMo Compose guidance and the built-in `compose:*` skill catalog.
- **goal** — a primary goal-driven agent mode that automatically sets the user's request as the session stopping condition and keeps the independent goal gate active.
- **actor** — a MiMo-compatible `operation` API and optional shell-style invocation for `run`, `spawn`, `status`, `wait`, `cancel`, and `send`, backed by the same-session `ActorSpawn` runtime.
- **memory** — a MiMo-compatible LLM tool for BM25 search across SWUST global, project, and session memory, backed by the core FTS5 memory index.
- **history** — a MiMo-style fallback tool for raw conversation trajectory search, with `search` snippets and `around` context expansion by `message_id`.

### Multiple Agents

| Agent | Description |
|-------|-------------|
| **build** | Default. Full tool permissions for development |
| **plan** | Read-only analysis mode for code exploration and solution design |
| **compose** | Workflow orchestration mode using bundled `compose:*` skills |
| **goal** | Goal-driven mode that continues until the request is completed, verified, or blocked |
| **explore** | Fast read-only search agent for locating code |

Press `Tab` to switch between primary agents. Subagents are created by the system as needed.

### Persistent Memory

Cross-session memory powered by SQLite FTS5 full-text search:

- **Project memory** (`MEMORY.md`) — persistent project knowledge, rules, and architecture decisions
- **Global memory** (`global/MEMORY.md`) — cross-project user preferences
- **Session checkpoint** (`checkpoint.md`) — structured 11-section state snapshot with per-section token budgets
- **Session notes** (`notes.md`) — temporary scratchpad for agents
- **Fact store** — one-fact-per-file storage with frontmatter, complementary to FTS5 search

Memory files support `@path` imports for cross-referencing. Memory is injected automatically when a session resumes.

The built-in `memory` tool is exposed to agents with the MiMo `operation: "search"` API: `query`, `scope`, `scope_id`, `type`, and `limit`. SWUST maps MiMo `global`, `projects`, and `sessions` scopes to its current memory index; `cc` scope and `type` filtering are accepted for compatibility and return explicit notes until those indexes are implemented.

The built-in `history` tool follows the MiMo escalation pattern: agents try `memory` first, then use `history` for exact or verbatim recall from raw session parts. A MiMo-style history writer listens to `message.part.updated` / `message.part.removed`, while background backfill indexes older `message` / `part` rows. `history.search` supports project/global scope plus session, kind, tool, and time filters. `history.around` expands a hit's `message_id` into neighboring messages for context. Configure indexed kinds with `history.kinds`.

### Goal-Driven Autonomy

The `goal` agent mode and the `--goal` flag both set a stopping condition for a session:

```bash
swust-code run --goal "fix all TypeScript errors" "start working"
```

When the agent tries to stop, an independent judge model evaluates the conversation to decide whether the condition is truly satisfied — preventing premature stops during autonomous work. Re-entry is capped at 12 attempts per goal.

In interactive mode, `/goal <condition>` routes the turn through the `goal` agent mode and sets that condition as the stop condition. Use `/goal clear` or `/goal reset` to remove it.

### Dream & Distill

- **`swust-code dream`** — scans recent session traces, extracts persistent knowledge into project memory, and removes outdated entries.
- **`swust-code distill`** — discovers repeated manual workflows in recent work and packages high-confidence candidates into reusable skills.

Automatic Dream/Distill follows MiMo's config shape: `dream.auto` / `distill.auto` disable the background trigger when set to `false`, and `dream.interval_days` / `distill.interval_days` control the minimum gap between runs. Defaults are 7 days for Dream and 30 days for Distill.

### Subagent System

The primary agent can create subagents on demand through the native `task` tool or the MiMo-compatible `actor` tool. The `actor` tool accepts the MiMo `operation` envelope:

- **run** — starts a subagent and returns its result inline.
- **spawn** — starts a background actor and returns an `actor_id`.
- **status / wait / cancel / send** — inspects, waits for, cancels, or sends an inbox message to a spawned actor.
- **model / output_schema** — forwards model overrides and structured-output schemas to the target subagent.
- **shell invocation** — set `tool.invocation_style_by_tool.actor = "shell"` to expose MiMo-style `actor run ...`, `actor spawn ...`, `actor wait ...` scripts.

The current actor implementation uses the MiMo-style `ActorSpawn` path: subagent messages stay in the parent session under an isolated `agentID` slice such as `general-1`, while the main transcript remains the default view. Actor lifecycle state is persisted in an `actor_registry` table. Actor `send` writes durable inbox rows, schedules a receiver wake when `SessionPrompt` is live, and the prompt loop drains inbox rows into the receiver's actor slice. Gate-eligible subagents also run a MiMo-style TaskGate completion check before final delivery. Plugin-driven actor `preStop`/`postStop` hook aggregation is wired into the actor lifecycle, with hook ReAct re-entry events published through SWUST Code's EventV2 stream. The MiMo-style built-in hook plugins are active: `checkpoint-splitover` validates `checkpoint-writer` output before stop, and `subagent-progress-checker` verifies task-bound writable subagents write `tasks/<task_id>/progress.md` with the required five-section journal.

The hidden MiMo-style `checkpoint-writer` subagent is registered as a system-spawned actor type. SWUST also includes the MiMo `checkpoint-progress-reconcile` scanner, which detects NEW/CHANGED `tasks/<task_id>/progress.md` files by comparing `written-at` frontmatter with `last-reconciled-written-at` checkpoint markers.

### Workflow Engine

Scriptable multi-agent orchestration with crash recovery:

- **Journal persistence** — JSONL logs with deterministic key deduplication
- **Crash recovery** — resume from last checkpoint on restart
- **Concurrency control** — semaphore bounded to `min(16, 2*cores)`
- **Built-in workflow** — Deep Research (6-phase pipeline with adversarial jury voting)

### Security

4-step permission pipeline with bash command safety analysis. Tools default to fail-closed: `isReadOnly=false`, `isDestructive=true`.

### Cache-First Architecture

The system prompt is split into a byte-stable prefix (agent prompt + tools + memory) and a per-turn tail (checkpoint + notes + tasks). The prefix stays identical across turns so LLM provider caches remain warm, reducing token costs in long sessions.

### Slash Commands

Interactive commands in the TUI:

| Command | Description |
|---------|-------------|
| `/memory <query>` | Search persistent memory |
| `/goal <condition>` | Run in goal agent mode with an autonomous stop condition |
| `/dream` | Trigger memory consolidation |
| `/distill` | Trigger workflow discovery |
| `/help` | Show available commands |

---

## Configuration

SWUST Code is configured via `.swust-code/config.json` in the project directory (or `~/.config/swust-code/config.json` globally). See the [Configuration Guide](https://swust-code-docs.pages.dev/guide/config).

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           CLI / TUI / Web / Desktop              │
├─────────────────────────────────────────────────┤
│           Session Runner                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Memory   │ │ Goal     │ │ Dream    │        │
│  │ Context  │ │ Gate     │ │ Trigger  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────┤
│  Tools / Security / Actor / Workflow / Skills    │
├─────────────────────────────────────────────────┤
│  SQLite FTS5 + Drizzle ORM + Effect-TS          │
└─────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.3.14 |
| Effect System | Effect-TS 4.0 beta |
| Database | SQLite + Drizzle ORM + FTS5 |
| LLM | Vercel AI SDK (15+ providers) |
| Frontend | SolidJS + OpenTUI |
| Package Manager | Bun + Turborepo |

---

## Development

```bash
bun install              # Install dependencies
bun run dev              # Run in development mode
bun turbo typecheck      # Type check
bun turbo test           # Run tests
```

---

## Documentation

Full documentation is available at **[swust-code-docs.pages.dev](https://swust-code-docs.pages.dev)**.

---

## Acknowledgments

SWUST Code stands on the shoulders of four open-source projects:

- [**OpenCode**](https://github.com/anomalyco/opencode) by Anomaly Co. — the foundation. All core capabilities (multi-provider LLM, TUI, LSP, MCP, plugin system) come from OpenCode.
- [**MiMo-Code**](https://github.com/XiaomiMiMo/MiMo-Code) by Xiaomi — persistent memory (FTS5), Dream/Distill self-improvement, Actor/Spawn orchestration, checkpoint system, context compaction, workflow engine, retry strategy, doom loop detection.
- [**DevEco Code**](https://github.com/nicognaW/deveco-code) by nicognaW — NAPI bridge for native tool loading, workspace adapter pattern, document validation system, tool output pruning.
- [**DeepSeek-Reasonix**](https://github.com/esengine/DeepSeek-Reasonix) by esengine — cache-stable prefix architecture, `@path` import directive, one-fact-per-file memory store, slash command system.

We are grateful to the maintainers and contributors of these projects for making their work available under open-source licenses.

---

## License

[MIT](LICENSE)
