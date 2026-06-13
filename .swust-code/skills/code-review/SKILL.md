---
name: code-review
description: Review code changes for correctness, style, and potential issues
---

# Code Review Skill

Review the current git diff or specified files for:
1. **Correctness**: Logic errors, edge cases, off-by-one errors
2. **Style**: Consistency with project conventions
3. **Performance**: Obvious inefficiencies, N+1 queries, unnecessary allocations
4. **Security**: Input validation, SQL injection, XSS, path traversal
5. **Testing**: Missing test coverage for new logic

## Process

1. Run `git diff` to see uncommitted changes, or read specified files
2. For each changed file, analyze the diff
3. Categorize findings by severity: critical, warning, suggestion
4. Provide specific, actionable feedback with line references
5. Suggest fixes where possible

## Output Format

```
## Code Review Summary

### Critical Issues
- [file:line] Description of issue

### Warnings
- [file:line] Description of concern

### Suggestions
- [file:line] Improvement suggestion
```
