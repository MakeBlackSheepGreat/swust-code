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

From MiMo-Code we ported: persistent memory (FTS5), Dream/Distill self-improvement, Actor/Spawn subagent orchestration, checkpoint system, context compaction, workflow engine, retry strategy, and doom loop detection.

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
- **Fact store** — one-fact-per-file storage with frontmatter, complementary to FTS5 search

Memory files support `@path` imports for cross-referencing. Memory is injected automatically when a session resumes.

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

The primary agent can create subagents on demand. Two spawn modes:
- **peer** — creates a new child session (full isolation)
- **subagent** — shares the parent session context (distinct actorID)

Subagents reuse the parent's prompt cache prefix (Fork Cache alignment) to reduce token costs.

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
| `/goal <condition>` | Set autonomous goal |
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
