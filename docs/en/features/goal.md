# Goal-Driven Autonomy

Set a goal with `--goal` and the agent works autonomously until it's done.

## Usage

```bash
swust-code run --goal "fix all TypeScript errors" "start working"
```

## How It Works

1. User sets a goal
2. Agent begins working
3. When agent tries to stop, **Goal Gate** triggers
4. **Goal Judge** (independent LLM) evaluates the conversation
5. If goal not met: injects synthetic message, agent continues
6. If goal met or impossible: stops normally

## Goal Judge

Independent LLM evaluator that reads the full conversation transcript and returns `{ ok, impossible, reason }`.

## Re-entry Control

| Role | Max Re-entries |
|------|---------------|
| Main Agent | 12 |
| Subagent | 3 |
