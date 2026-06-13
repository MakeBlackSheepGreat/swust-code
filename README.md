<h1 align="center">SWUST Code</h1>

<p align="center">
  <strong>An open-source AI coding agent with persistent memory, goal-driven autonomy, and self-improvement.</strong>
</p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

<p align="center">
  <a href="https://github.com/MakeBlackSheepGreat/swust-code">GitHub</a> | <a href="docs/DIFFERENCES.md">Why SWUST Code?</a> | <a href="docs/quickstart.md">Quick Start</a>
</p>

---

SWUST Code is a terminal-native AI coding agent built on [OpenCode](https://github.com/anomalyco/opencode). It goes beyond code assistance — it **remembers** your project across sessions, **learns** from your work patterns, and **evolves** its own capabilities over time.

Built with Effect-TS, SQLite FTS5, and the Vercel AI SDK, SWUST Code supports 15+ LLM providers and runs as CLI, TUI, Web, or Desktop app from a single codebase.

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

Configure your LLM provider:

```bash
# Set API key (choose one)
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"

# Run interactively
swust-code

# Run with a message
swust-code run "explain this project"

# Run with an autonomous goal
swust-code run --goal "fix all TypeScript errors" "start working"
```

---

## Core Features

### Persistent Memory

Cross-session memory powered by SQLite FTS5 full-text search:

- **Project memory** (`projects/<id>/MEMORY.md`) — persistent project knowledge, rules, architecture decisions
- **Global memory** (`global/MEMORY.md`) — cross-project user preferences
- **Session checkpoint** (`sessions/<id>/checkpoint.md`) — structured 11-section state snapshot with per-section token budgets
- **Session notes** (`sessions/<id>/notes.md`) — temporary scratchpad for agents

The agent automatically indexes memory files for full-text search, injects relevant context into conversations, and persists knowledge across sessions.

```bash
# Memory tools available to the agent:
# memory      — search persistent knowledge (FTS5 + BM25 ranking)
# memory_write — write structured knowledge to memory files
```

### Goal-Driven Autonomy

Set a goal and the agent works autonomously until it's done:

```bash
swust-code run --goal "refactor the auth module to use JWT" "start working"
```

- **Goal Judge** — an independent LLM evaluates whether the goal is truly met
- **Re-entry control** — up to 12 re-entries per goal to prevent infinite loops
- **Task Gate** — secondary stop condition checking for incomplete tasks
- **Step Classifier** — deterministic priority cascade for loop decisions

### Self-Improvement

The agent continuously improves itself from your usage patterns:

- **`swust-code dream`** — scans recent session traces, extracts persistent knowledge into project memory, removes outdated entries (auto-triggers every 7 days)
- **`swust-code distill`** — discovers repeated manual workflows and packages high-confidence candidates into reusable skills (auto-triggers every 30 days)

### Multi-Agent Orchestration

| Mode | Description |
|------|-------------|
| **peer** | Creates a new child session (full isolation) |
| **subagent** | Shares the parent session context (distinct actorID) |

- **Actor Registry** — lifecycle tracking, orphan recovery, stuck detection
- **Fork Cache Alignment** — subagents reuse the parent's prompt cache prefix
- **Coordinator Protocol** — structured phases: Research → Synthesis → Implementation → Verification

### Workflow Engine

Scriptable multi-agent orchestration with crash recovery:

```javascript
// Deep Research workflow (built-in)
phase('Plan')
const plan = await agent('Break into search lines: ' + args)
const results = await parallel(plan.lines.map(line => () => agent('Search: ' + line)))
// ... Extract → Group → Crosscheck → Report
```

- **Journal persistence** — JSONL logs with deterministic key deduplication
- **Crash recovery** — resume from last checkpoint on restart
- **Concurrency control** — semaphore bounded to `min(16, 2*cores)`

### Security

4-step permission pipeline with bash command safety analysis:

1. **Blanket deny rules** — immediate block
2. **Blanket ask rules** — prompt user
3. **Tool-specific check** — `checkPermissions()` per tool
4. **Mode override** — bypass/acceptEdits/dontAsk/auto

Bash safety analyzer detects 21 dangerous patterns (rm -rf, fork bomb, eval, chmod 777, curl|sh, etc.).

### Skills System

Create custom skills in `.swust-code/skills/<name>/SKILL.md`:

```markdown
---
name: code-review
description: Review code changes for correctness, style, and potential issues
---

# Code Review Skill
...
```

Skills are automatically discovered from multiple sources and conditionally activated based on file paths.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              CLI / TUI / Web / Desktop           │
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

## Supported Providers

Anthropic, OpenAI, Google, Azure, AWS Bedrock, Groq, Mistral, xAI, Cohere, Perplexity, Together AI, OpenRouter, Cloudflare Workers AI, and any OpenAI-compatible API.

---

## Development

```bash
# Clone
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code

# Install
bun install

# Run CLI
bun run --cwd packages/opencode src/index.ts

# Typecheck
bun typecheck

# Run tests
bun turbo test
```

---

## Comparison with OpenCode

SWUST Code adds **6 core capability layers** on top of OpenCode:

| Capability | OpenCode | SWUST Code |
|-----------|----------|------------|
| Memory | None | FTS5 + BM25 + incremental sync |
| Autonomy | None | Goal Judge + Task Gate + re-entry control |
| Evolution | None | Dream + Distill + auto-trigger |
| Security | Basic | 4-step pipeline + bash safety + fail-closed defaults |
| Orchestration | Basic | Actor + ForkCache + Coordinator |
| Workflow | None | QuickJS sandbox + journal + Deep Research |

See [docs/DIFFERENCES.md](docs/DIFFERENCES.md) for the complete analysis.

---

## Acknowledgments

Based on [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co.

Key patterns ported from:
- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) — Memory system, Dream/Distill, Actor/Spawn, Workflow engine
- [DevEco Code](https://github.com/nicognaW/deveco-code) — NAPI bridge, Workspace adapter, Document validation
- Claude Code (reverse-engineered) — Permission pipeline, Bash safety, Coordinator protocol

## License

[MIT](LICENSE)
