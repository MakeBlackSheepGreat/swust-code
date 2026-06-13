# 工具参考

SWUST Code 提供的 LLM 可调用工具。

## 内置工具

| 工具 | 说明 | 只读 |
|------|------|------|
| `bash` | 执行 shell 命令 | 否 |
| `read` | 读取文件内容 | 是 |
| `write` | 写入文件 | 否 |
| `edit` | 编辑文件（精确替换） | 否 |
| `glob` | 文件模式匹配搜索 | 是 |
| `grep` | 内容搜索（ripgrep） | 是 |
| `webfetch` | 获取网页内容 | 是 |
| `websearch` | 搜索互联网 | 是 |
| `memory` | 搜索持久记忆 | 是 |
| `memory_write` | 写入记忆 | 否 |
| `todowrite` | 任务看板管理 | 否 |
| `question` | 向用户提问 | 否 |
| `skill` | 加载技能 | 是 |

## 安全属性

每个工具有三个安全属性：

- `isReadOnly` — 只读操作，自动允许
- `isConcurrencySafe` — 可并行执行
- `isDestructive` — 有破坏性，需确认

## Bash 安全

Bash 工具内置安全分析器，自动检测危险命令模式（详见[安全防护](/features/security)）。
