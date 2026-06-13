# 技能系统

SKILL.md 声明式技能，自动发现，条件激活。

## 创建技能

在 `.swust-code/skills/<name>/SKILL.md` 中创建：

```markdown
---
name: code-review
description: 审查代码变更的正确性、风格和潜在问题
---

# 代码审查技能

## 步骤
1. 运行 `git diff` 查看变更
2. 逐文件分析 diff
3. 按严重程度分类：critical / warning / suggestion
4. 提供具体的、可操作的反馈

## 输出格式
## Code Review Summary
### Critical Issues
- [file:line] 问题描述
```

## Frontmatter 字段

| 字段 | 说明 |
|------|------|
| `name` | 技能名称 |
| `description` | 描述（用于搜索匹配） |
| `hidden` | 是否对用户隐藏 |
| `allowed-tools` | 允许使用的工具列表 |
| `model` | 指定使用的模型 |
| `paths` | 条件激活的文件路径模式 |

## 条件激活

```yaml
---
name: react-component
description: React 组件开发指南
paths:
  - "src/components/**/*.tsx"
  - "src/pages/**/*.tsx"
---
```

当用户触碰匹配的文件时，技能自动激活。

## 多源加载

技能从以下位置自动发现：

| 来源 | 路径 |
|------|------|
| 项目级 | `.swust-code/skills/` |
| 全局用户 | `~/.config/swust-code/skills/` |
| 外部目录 | `.claude/skills/`、`.agents/skills/` |
