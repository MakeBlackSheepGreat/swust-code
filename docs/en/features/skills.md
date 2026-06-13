# Skills System

SKILL.md declarative skills, auto-discovered, conditionally activated.

## Create a Skill

In `.swust-code/skills/<name>/SKILL.md`:

```markdown
---
name: code-review
description: Review code changes for correctness and style
---

# Code Review Skill

## Steps
1. Run `git diff` to see changes
2. Analyze each file
3. Categorize: critical / warning / suggestion
4. Provide actionable feedback
```

## Frontmatter Fields

| Field | Description |
|-------|-------------|
| `name` | Skill name (required) |
| `description` | Description (required, used for search matching) |
| `hidden` | Hide from user |
| `allowed-tools` | Allowed tools list |
| `model` | Specify model |
| `paths` | Conditional activation patterns |

## Conditional Activation

When `paths` exists, the skill activates only when the user touches matching files:

```yaml
paths:
  - "src/components/**/*.tsx"
```

Uses gitignore-style pattern matching.
