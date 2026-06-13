# SWUST Code Quick Start

## Installation

```bash
npm install -g @swust-code/cli
```

## First Run

```bash
# Start interactive TUI
swust-code

# Run a single command
swust-code run "explain this project"

# Set an autonomous goal
swust-code run --goal "fix all TypeScript errors" "start working"
```

## Configuration

Create `.swust-code/config.json` in your project root:

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "permissions": {
    "bash": "ask",
    "write": "allow"
  }
}
```

## Memory System

SWUST Code remembers project knowledge across sessions:

```bash
# Memory files are stored at:
# ~/.local/share/swust-code/memory/projects/<id>/MEMORY.md

# The agent automatically:
# - Indexes memory files for full-text search
# - Injects relevant context into conversations
# - Consolidates knowledge via Dream (every 7 days)
# - Discovers repeated workflows via Distill (every 30 days)
```

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

## Memory Files

Organize knowledge in memory directories:

```
~/.local/share/swust-code/memory/
  global/MEMORY.md              # Cross-project preferences
  projects/<hash>/MEMORY.md     # Project-specific knowledge
  sessions/<id>/checkpoint.md   # Session checkpoints
```
