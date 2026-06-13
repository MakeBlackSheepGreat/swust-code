# 技能开发

## 创建技能

在 `.swust-code/skills/<name>/SKILL.md` 中创建：

```markdown
---
name: my-skill
description: 技能描述
hidden: false
allowed-tools:
  - read
  - bash
  - edit
paths:
  - "src/**/*.ts"
---

# 技能标题

## 使用场景
当用户需要...时使用此技能。

## 步骤
1. 第一步...
2. 第二步...

## 输出格式
期望的输出格式...
```

## Frontmatter 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 技能名称（必填） |
| `description` | string | 描述（必填，用于搜索匹配） |
| `hidden` | boolean | 是否对用户隐藏 |
| `allowed-tools` | string[] | 允许使用的工具 |
| `model` | string | 指定模型 |
| `paths` | string[] | 条件激活的路径模式 |

## 条件激活

当 `paths` 字段存在时，技能仅在用户触碰匹配文件时激活：

```yaml
paths:
  - "src/components/**/*.tsx"
  - "src/pages/**/*.tsx"
```

使用 gitignore 风格的模式匹配。

## 测试技能

1. 创建 SKILL.md 文件
2. 启动 SWUST Code
3. 使用 `/skill` 命令加载技能
4. 验证技能行为
