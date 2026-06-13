# SWUST Code

> A self-evolving AI coding agent — remembers, learns, and grows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Runtime-Bun-fb923c.svg)](https://bun.sh/)

SWUST Code is an open-source AI coding agent built on [OpenCode](https://github.com/anomalyco/opencode), with **persistent memory**, **goal-driven autonomy**, and **self-improvement** capabilities.

## What Makes SWUST Code Different

| Feature | Description |
|---------|-------------|
| **Persistent Memory** | FTS5 full-text search across project knowledge that persists between sessions |
| **Goal-Driven Autonomy** | Set a goal with `--goal` and the agent works autonomously until it's done |
| **Self-Improvement** | Dream (memory consolidation) and Distill (workflow packaging) run automatically |
| **Security** | 4-step permission pipeline with bash command safety analysis |
| **Multi-Agent** | Actor/Spawn system with fork cache alignment and coordinator protocol |
| **Workflow Engine** | Scriptable multi-agent orchestration with crash recovery |

## Quick Start

```bash
# Install
npm install -g swust-code

# Run interactively
swust-code

# Run with a message
swust-code run "explain this project"

# Run with an autonomous goal
swust-code run --goal "fix all TypeScript errors" "start working"
```

## Configuration

Create `.swust-code/config.json` in your project root:

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "permissions": {
    "bash": "ask",
    "write": "allow",
    "edit": "allow"
  }
}
```

Set your API key:

```bash
export ANTHROPIC_API_KEY="your-key"
# or
export OPENAI_API_KEY="your-key"
```

## Memory System

SWUST Code remembers project knowledge across sessions:

```bash
# Memory files are stored at:
~/.local/share/swust-code/memory/
  global/MEMORY.md              # Cross-project preferences
  projects/<hash>/MEMORY.md     # Project-specific knowledge
  sessions/<id>/checkpoint.md   # Session checkpoints
```

The agent automatically:
- Indexes memory files for full-text search (SQLite FTS5)
- Injects relevant context into conversations
- Consolidates knowledge via Dream (every 7 days)
- Discovers repeated workflows via Distill (every 30 days)

## Key Commands

| Command | Description |
|---------|-------------|
| `swust-code` | Start interactive TUI |
| `swust-code run "msg"` | Run with a message |
| `swust-code run --goal "cond" "msg"` | Autonomous goal-driven execution |
| `swust-code dream` | Consolidate project memory |
| `swust-code distill` | Discover and package repeated workflows |
| `swust-code mcp list` | List MCP servers |
| `swust-code providers` | Manage AI providers |

## Skills

Create custom skills in `.swust-code/skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does
---

# Instructions for the skill...
```

Skills are automatically discovered and available to the agent.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              CLI (swust-code)                    │
│    run / dream / distill / --goal               │
├─────────────────────────────────────────────────┤
│           Session Runner                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Memory   │ │ Goal     │ │ Dream    │        │
│  │ Context  │ │ Gate     │ │ Trigger  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────┤
│     Tools / Security / Actor / Workflow          │
├─────────────────────────────────────────────────┤
│     SQLite FTS5 + Drizzle ORM + Effect-TS       │
└─────────────────────────────────────────────────┘
```

## Development

```bash
# Clone
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code

# Install dependencies
bun install

# Run CLI
bun run --cwd packages/opencode src/index.ts

# Typecheck
bun typecheck

# Run tests
bun turbo test
```

## Acknowledgments

Based on [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co.

Key patterns ported from:
- [MiMo-Code](https://github.com/XiaoMi/MiMo-Code) — Memory system, Dream/Distill, Actor/Spawn, Workflow engine
- [DevEco Code](https://github.com/nicognaW/deveco-code) — NAPI bridge, Workspace adapter, Document validation
- Claude Code (reverse-engineered) — Permission pipeline, Bash safety, Coordinator protocol

## License

[MIT](LICENSE)
