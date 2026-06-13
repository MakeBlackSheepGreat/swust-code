# Configuration

SWUST Code is configured via `.swust-code/config.json` in the project directory.

## Basic Config

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SWUST_CODE_CONFIG_DIR` | Custom config directory |
| `SWUST_CODE_DB` | Custom database path |
| `SWUST_CODE_PURE` | Disable external plugins |
| `SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH` | Auto-sync memory before search (default: true) |
