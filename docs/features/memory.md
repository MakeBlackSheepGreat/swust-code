# 持久化记忆

SWUST Code 的记忆系统让你的 AI 编程助手跨会话记住项目知识。

## 工作原理

记忆存储在 SQLite FTS5 全文搜索索引中，支持毫秒级检索。每次对话开始时，相关记忆自动注入到 system prompt 中。

## 记忆目录结构

```
~/.local/share/swust-code/memory/
  global/
    MEMORY.md              # 跨项目用户偏好
  projects/
    <project_hash>/
      MEMORY.md            # 项目知识
      architecture.md      # 架构决策
      rules.md             # 项目规则
  sessions/
    <session_id>/
      checkpoint.md        # 会话检查点（11 段结构）
      notes.md             # 临时笔记
```

## 记忆工具

### memory（搜索）

LLM 可调用 `memory` 工具搜索记忆：

```json
{
  "query": "认证模块 JWT 配置",
  "kind": "project",
  "limit": 5
}
```

使用 BM25 排序，1-3 个关键词效果最佳。

### memory_write（写入）

LLM 可调用 `memory_write` 工具写入记忆：

```json
{
  "scope": "projects",
  "scopeId": "abc123",
  "key": "MEMORY.md",
  "content": "## 架构决策\n使用 JWT 进行用户认证...",
  "mode": "append"
}
```

## 自动行为

- **搜索前同步**：每次搜索前自动将磁盘文件同步到 FTS 索引
- **上下文注入**：会话启动时自动注入 MEMORY.md 内容（4KB 上限）
- **增量同步**：基于文件大小和修改时间的指纹比对，只处理变化文件

## 技术细节

- **存储**：SQLite FTS5 虚拟表 + 外部内容模式
- **分词**：Unicode regex `/[\p{L}\p{N}_]+/u`，支持中日韩
- **排序**：BM25 + 相对分数阈值（top_hit × 0.15）
- **同步**：Semaphore(1) 并发控制，懒触发
