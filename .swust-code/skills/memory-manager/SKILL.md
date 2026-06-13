---
name: memory-manager
description: Manage project memory files - create, update, and organize persistent knowledge
---

# Memory Manager Skill

Help manage the SWUST Code memory system for optimal knowledge retention.

## Memory Layout

```
<data>/memory/
  global/MEMORY.md          -- Cross-project preferences
  projects/<id>/MEMORY.md   -- Project-specific knowledge
  sessions/<id>/checkpoint.md -- Session checkpoints
  sessions/<id>/notes.md    -- Session scratch notes
```

## Operations

### Create Memory Entry
Use `memory_write` tool with appropriate scope:
- `scope: "projects"`, `scopeId: <project_hash>` for project memory
- `scope: "global"`, `scopeId: ""` for cross-project preferences

### Search Memory
Use `memory` tool with distinctive keywords (1-3 terms work best).

### Organize Memory
Structure MEMORY.md with these sections:
- `## Rules` - Project conventions and constraints
- `## Architecture decisions` - Key design choices with rationale
- `## Discovered knowledge` - Cross-session facts
- `## Patterns` - Recurring problems and solutions
- `## Gotchas` - Easy-to-miss traps

## Best Practices
- Keep entries concise (1-3 lines each)
- Convert relative dates to YYYY-MM-DD
- Remove superseded entries
- Keep MEMORY.md under 200 lines / 10KB
