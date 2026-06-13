# Workflow Engine

Scriptable multi-agent orchestration with crash recovery.

## Built-in Workflow: Deep Research

6-phase research pipeline:
1. **Plan** — Break question into search lines
2. **Search** — Parallel web search
3. **Extract** — Extract facts from sources
4. **Group** — Deduplicate and group
5. **Crosscheck** — 3-juror adversarial voting
6. **Report** — Generate cited report

## Custom Workflows

Workflows are JavaScript scripts with host functions:
- `agent(prompt, opts?)` — spawn subagent
- `parallel(thunks)` — run tasks concurrently
- `pipeline(items, ...stages)` — sequential processing
- `phase(title)` — mark phase
- `log(message)` — emit log

## Crash Recovery

- JSONL journal with deterministic key dedup
- Script SHA validation (clears journal on change)
- Resume from last checkpoint
