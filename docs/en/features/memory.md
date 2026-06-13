# Persistent Memory

SWUST Code's memory system lets your AI coding assistant remember project knowledge across sessions.

## How It Works

Memory is stored in SQLite FTS5 full-text search index, supporting millisecond-level retrieval. At the start of each conversation, relevant memories are automatically injected into the system prompt.

## Memory Directory Structure

```
~/.local/share/swust-code/memory/
  global/
    MEMORY.md              # Cross-project preferences
  projects/
    <project_hash>/
      MEMORY.md            # Project knowledge
  sessions/
    <session_id>/
      checkpoint.md        # Session checkpoint (11 sections)
      notes.md             # Temporary notes
```

## Memory Tools

- `memory` — Search persistent knowledge (FTS5 + BM25 ranking)
- `memory_write` — Write structured knowledge to memory files

## Automatic Behavior

- **Pre-search sync**: Automatically syncs disk files to FTS index before each search
- **Context injection**: Auto-injects MEMORY.md content into system prompt (4KB cap)
- **Incremental sync**: Fingerprints based on file size and mtime, only processes changed files
