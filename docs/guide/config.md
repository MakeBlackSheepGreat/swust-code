# 配置

SWUST Code 通过 JSON 配置文件管理行为。

## 配置文件位置

| 范围 | 路径 |
|------|------|
| 项目级 | `.swust-code/config.json`（项目根目录） |
| 全局级 | `~/.config/swust-code/config.json` |

项目级配置优先于全局配置。

## 基本配置

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "shell": "/bin/bash",
  "permissions": {
    "bash": "ask",
    "write": "allow",
    "edit": "allow",
    "read": "allow"
  }
}
```

## 模型配置

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "agents": {
    "build": {
      "model": "anthropic/claude-opus-4-8"
    },
    "explore": {
      "model": "anthropic/claude-haiku-4-5-20251001"
    }
  }
}
```

## 权限配置

```json
{
  "permissions": {
    "bash": "ask",
    "write": "allow",
    "edit": "allow",
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "memory": "allow",
    "memory_write": "ask"
  }
}
```

权限值：`allow`（自动允许）、`ask`（每次询问）、`deny`（拒绝）

## MCP 服务器

```json
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://example.com/mcp"
    }
  }
}
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `SWUST_CODE_CONFIG_DIR` | 自定义配置目录 |
| `SWUST_CODE_DB` | 自定义数据库路径 |
| `SWUST_CODE_PURE` | 禁用外部插件 |
| `SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH` | 搜索前自动同步记忆（默认 true） |
| `SWUST_CODE_MEMORY_SEARCH_SCORE_FLOOR` | 记忆搜索分数阈值（默认 0.15） |
