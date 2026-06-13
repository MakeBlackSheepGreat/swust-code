# Quick Start

SWUST Code is a terminal-native AI coding agent with persistent memory and self-improvement capabilities.

## Install

```bash
npm install -g swust-code
```

## First Run

```bash
swust-code
```

The first launch guides you through configuration automatically.

## Configure API Key

```bash
export ANTHROPIC_API_KEY="your-key"
# or
export OPENAI_API_KEY="your-key"
```

## Basic Usage

```bash
# Interactive mode
swust-code

# Single run
swust-code run "explain this project"

# Autonomous mode
swust-code run --goal "fix all TypeScript errors" "start working"

# Knowledge consolidation
swust-code dream

# Skill discovery
swust-code distill
```

## Next Steps

- [Installation](/en/guide/install) — Detailed installation methods
- [Configuration](/en/guide/config) — Configuration file reference
- [LLM Providers](/en/guide/providers) — Supported models
- [Persistent Memory](/en/features/memory) — Memory system deep dive
