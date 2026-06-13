---
name: project-setup
description: Set up a new project with best practices, configuration, and initial structure
---

# Project Setup Skill

Guide the user through setting up a new project with proper configuration.

## Steps

1. **Detect project type** from existing files (package.json, Cargo.toml, go.mod, etc.)
2. **Create MEMORY.md** with initial project context:
   - Project name and purpose
   - Tech stack
   - Key conventions
3. **Create .swust-code/config.json** with recommended settings:
   - Default model selection
   - Permission rules
   - MCP server configuration
4. **Initialize memory structure**:
   - `memory/projects/<id>/MEMORY.md` with project overview
   - `memory/global/MEMORY.md` with user preferences (if first project)
5. **Create AGENTS.md** with project-specific instructions for the AI

## Configuration Template

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

## Output
- Project-specific MEMORY.md created
- Configuration file with sensible defaults
- Initial AGENTS.md with project conventions
