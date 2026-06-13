# Security

SWUST Code uses a layered security model.

## 4-Step Permission Pipeline

1. Blanket deny rules — immediate block
2. Blanket ask rules — prompt user
3. Tool-specific `checkPermissions()` — per tool
4. Mode override — bypass / acceptEdits / dontAsk / auto

## Bash Safety

Detects dangerous patterns before execution:
- `rm -rf /` — recursive deletion from root
- `curl | sh` — download and execute
- `eval` — dynamic code execution
- `chmod 777` — world-writable permissions
- Fork bombs, kill all processes, etc.

## Tool Permissions

| Property | Default | Description |
|----------|---------|-------------|
| `isReadOnly` | false | Read-only operation |
| `isConcurrencySafe` | false | Can run in parallel |
| `isDestructive` | true | Has destructive potential |

**Fail-closed defaults**: New tools default to strictest permissions.
