<h1 align="center">SWUST Code</h1>

<p align="center">
  <strong>开源 AI 编程智能体，拥有持久记忆、目标驱动自治和自我进化能力。</strong>
</p>

<p align="center">
  <a href="https://swust-code-docs.pages.dev"><img src="https://img.shields.io/badge/docs-live-brightgreen" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=social" alt="Stars"></a>
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

---

SWUST Code 基于 Anomaly Co. 的 [OpenCode](https://github.com/anomalyco/opencode) 构建，核心能力移植自小米的 [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)、nicognaW 的 [DevEco Code](https://github.com/nicognaW/deveco-code) 和 esengine 的 [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)。保留了 OpenCode 的全部核心能力（多 Provider、TUI、LSP、MCP、插件），并在此基础上增加了持久化记忆、目标驱动自治、自我进化、多智能体编排、工作流引擎、分层安全和缓存优先架构。

从 MiMo-Code 移植：持久化记忆和原始历史搜索（FTS5）、Dream/Distill 自我进化、Compose 技能、Actor/Spawn 兼容子智能体编排、检查点系统、上下文压缩、工作流引擎、重试策略、死循环检测。

从 DevEco Code 移植：NAPI 原生工具桥接、Workspace 适配器模式、文档验证系统、Tool Output 裁剪。

从 DeepSeek-Reasonix 移植：Cache-Stable 前缀架构、@path 导入指令、One-Fact-Per-File 记忆存储、Slash 命令系统。

> **[阅读完整文档](https://swust-code-docs.pages.dev)** — 安装、配置、功能详解、API 参考、开发者指南。

---

## 快速开始

```bash
# 通过 npm 安装
npm install -g swust-code

# 或从源码构建
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code && bun install
bun run --cwd packages/opencode src/index.ts
```

首次启动自动引导配置。支持：
- **Anthropic** — 通过 API Key 接入 Claude 模型
- **OpenAI** — 通过 API Key 接入 GPT 模型
- **Google** — 通过 API Key 接入 Gemini 模型
- **自定义 Provider** — TUI 内添加任意 OpenAI 兼容 API

---

## 核心特性

### 0.3 版本重点

SWUST Code 0.3 新增两个主智能体模式，以及 MiMo 兼容 actor、memory 和 history 工具入口：

- **compose** — 主编排智能体，注入 MiMo Compose 提示和内置 `compose:*` 技能目录。
- **goal** — 目标驱动主智能体，自动把用户请求设为会话停止条件，并启用独立目标 gate。
- **actor** — 兼容 MiMo `operation` API 和可选 shell-style 调用的工具，支持 `run`、`spawn`、`status`、`wait`、`cancel`、`send`，底层接入同会话 `ActorSpawn` 运行时。
- **memory** — 兼容 MiMo 的 LLM 工具，可基于 core FTS5 记忆索引对 SWUST 全局、项目、会话记忆执行 BM25 搜索。
- **history** — MiMo 风格的原始会话轨迹回查工具，支持 `search` 片段检索和基于 `message_id` 的 `around` 上下文展开。

### 多智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认。完整工具权限，用于开发 |
| **plan** | 只读分析模式，适合代码探索和方案设计 |
| **compose** | 使用内置 `compose:*` 技能的工作流编排模式 |
| **goal** | 持续工作到请求完成、完成验证或明确受阻的目标模式 |
| **explore** | 快速只读搜索智能体，用于定位代码 |

按 `Tab` 在主智能体间切换。子智能体由系统按需生成。

### 持久化记忆

基于 SQLite FTS5 全文搜索的跨会话记忆：

- **项目记忆** (`MEMORY.md`) — 跨会话持久的项目知识、规则、架构决策
- **全局记忆** (`global/MEMORY.md`) — 跨项目用户偏好
- **会话检查点** (`checkpoint.md`) — 结构化 11 段状态快照，每段独立 token 预算
- **会话笔记** (`notes.md`) — Agent 临时记录区
- **事实存储** — 每个事实一个 md 文件 + frontmatter，与 FTS5 互补

记忆文件支持 `@path` 导入实现交叉引用。记忆自动在会话恢复时注入上下文。

内置 `memory` 工具向智能体暴露 MiMo `operation: "search"` API：`query`、`scope`、`scope_id`、`type`、`limit`。SWUST 会将 MiMo 的 `global`、`projects`、`sessions` scope 映射到当前记忆索引；`cc` scope 和 `type` 过滤作为兼容字段接收，在对应索引实现前会返回明确说明。

内置 `history` 工具遵循 MiMo 的升级查询模式：智能体先查 `memory`，需要精确原文或逐字回忆时再查 `history`。MiMo 风格 history writer 会监听 `message.part.updated` / `message.part.removed`，后台 backfill 会索引旧的 `message` / `part` 行。`history.search` 支持 project/global scope，以及 session、kind、tool、time 过滤。`history.around` 可用命中结果中的 `message_id` 展开前后消息上下文。可通过 `history.kinds` 配置进入索引的 part 类型。

### 目标驱动自治

`goal` 智能体模式和 `--goal` 参数都会设定会话停止条件：

```bash
swust-code run --goal "修复所有 TypeScript 错误" "开始工作"
```

当 agent 尝试停止时，独立的 judge 模型会评估对话，判断条件是否真正满足——防止自治工作中的过早停止。每个目标最多重入 12 次。

在交互模式中，`/goal <condition>` 会通过 `goal` 智能体模式执行本轮请求，并将该条件设为停止条件；可使用 `/goal clear` 或 `/goal reset` 清除当前目标。

### Dream & Distill

- **`swust-code dream`** — 扫描近期会话轨迹，将持久知识提炼到项目记忆，移除过时条目。
- **`swust-code distill`** — 发现重复的手动工作流，将高置信度候选打包为可复用技能。

自动 Dream/Distill 采用 MiMo 同名配置形态：`dream.auto` / `distill.auto` 设为 `false` 时关闭后台触发，`dream.interval_days` / `distill.interval_days` 控制两次运行的最小间隔。默认值分别为 Dream 7 天、Distill 30 天。

### 子智能体系统

主智能体可通过原生 `task` 工具或 MiMo 兼容 `actor` 工具按需生成子智能体。`actor` 工具使用 MiMo 的 `operation` 调用结构：

- **run** — 启动子智能体，并以内联结果返回。
- **spawn** — 启动后台 actor，并返回 `actor_id`。
- **status / wait / cancel / send** — 查询、等待、取消已启动的 actor，或向 actor inbox 发送消息。
- **model / output_schema** — 将模型覆盖和结构化输出 schema 透传给目标子智能体。
- **shell invocation** — 设置 `tool.invocation_style_by_tool.actor = "shell"` 后，暴露 MiMo 风格的 `actor run ...`、`actor spawn ...`、`actor wait ...` 脚本调用。

当前 actor 实现使用 MiMo 风格的 `ActorSpawn` 路径：子智能体消息保留在父会话内，并写入 `general-1` 这类独立 `agentID` 分片；主对话仍是默认视图。Actor 生命周期状态会写入 `actor_registry` 表。Actor `send` 现在会写入持久化 inbox 记录，在 `SessionPrompt` 在线时调度接收者唤醒，并由 prompt loop 将 inbox 消息投递到接收者 actor 分片。可进入 gate 的子智能体还会在最终返回前执行 MiMo 风格 TaskGate 完成检查。插件驱动的 actor `preStop`/`postStop` hook 聚合已接入 actor 生命周期，hook ReAct 重入事件会通过 SWUST Code 的 EventV2 事件流发布。MiMo 风格内置 hook 插件已启用：`checkpoint-splitover` 会在 `checkpoint-writer` 停止前校验 checkpoint 输出，`subagent-progress-checker` 会校验绑定 `task_id` 的可写子智能体是否按五段模板写入 `tasks/<task_id>/progress.md`。

隐藏的 MiMo 风格 `checkpoint-writer` 子智能体已注册为 system-spawned actor 类型。SWUST 也加入了 MiMo 的 `checkpoint-progress-reconcile` 扫描器，可通过 `written-at` frontmatter 和 checkpoint 中的 `last-reconciled-written-at` 标记识别 NEW/CHANGED 的 `tasks/<task_id>/progress.md`。

### 工作流引擎

可脚本化的多智能体编排运行时，支持崩溃恢复：

- **Journal 持久化** — JSONL 日志，确定性 key 去重
- **崩溃恢复** — 从最后检查点恢复执行
- **并发控制** — 信号量限制为 `min(16, 2*cores)`
- **内置工作流** — Deep Research（6 阶段流水线，带对抗性陪审团投票）

### 安全防护

四步权限流水线 + Bash 命令安全分析。工具默认 fail-closed。

### 缓存优先架构

System prompt 分为字节稳定的前缀（Agent 提示 + 工具定义 + 记忆）和每轮变化的尾部（检查点 + 笔记 + 任务）。前缀在会话内保持不变，确保 LLM Provider 缓存持续命中，降低长会话的 token 成本。

### Slash 命令

TUI 内交互式命令：

| 命令 | 说明 |
|------|------|
| `/memory <query>` | 搜索持久记忆 |
| `/goal <condition>` | 进入 goal 智能体模式并设定自治停止条件 |
| `/dream` | 触发记忆整合 |
| `/distill` | 触发技能发现 |
| `/help` | 显示可用命令 |

---

## 配置

SWUST Code 通过项目目录下的 `.swust-code/config.json` 配置（全局配置在 `~/.config/swust-code/config.json`）。详见[配置指南](https://swust-code-docs.pages.dev/guide/config)。

---

## 架构

```
┌─────────────────────────────────────────────────┐
│           CLI / TUI / Web / Desktop              │
├─────────────────────────────────────────────────┤
│           Session Runner                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 记忆     │ │ 目标     │ │ 进化     │        │
│  │ 上下文   │ │ Gate     │ │ 触发器   │        │
│  └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────┤
│  工具 / 安全 / Actor / 工作流 / 技能             │
├─────────────────────────────────────────────────┤
│  SQLite FTS5 + Drizzle ORM + Effect-TS          │
└─────────────────────────────────────────────────┘
```

| 层 | 技术 |
|----|------|
| 运行时 | Bun 1.3.14 |
| 效果系统 | Effect-TS 4.0 beta |
| 数据库 | SQLite + Drizzle ORM + FTS5 |
| LLM | Vercel AI SDK (15+ 提供商) |
| 前端 | SolidJS + OpenTUI |
| 包管理 | Bun + Turborepo |

---

## 开发

```bash
bun install              # 安装依赖
bun run dev              # 开发模式运行
bun turbo typecheck      # 类型检查
bun turbo test           # 运行测试
```

---

## 文档

完整文档请访问 **[swust-code-docs.pages.dev](https://swust-code-docs.pages.dev)**。

---

## 致谢

SWUST Code 站在四个开源项目的肩膀上：

- [**OpenCode**](https://github.com/anomalyco/opencode) by Anomaly Co. — 基座。所有核心能力（多 Provider LLM、TUI、LSP、MCP、插件系统）来自 OpenCode。
- [**MiMo-Code**](https://github.com/XiaomiMiMo/MiMo-Code) by 小米 — 持久化记忆（FTS5）、Dream/Distill 自我进化、Actor/Spawn 编排、检查点系统、上下文压缩、工作流引擎、重试策略、死循环检测。
- [**DevEco Code**](https://github.com/nicognaW/deveco-code) by nicognaW — NAPI 原生工具桥接、Workspace 适配器模式、文档验证系统、Tool Output 裁剪。
- [**DeepSeek-Reasonix**](https://github.com/esengine/DeepSeek-Reasonix) by esengine — Cache-Stable 前缀架构、@path 导入指令、One-Fact-Per-File 记忆存储、Slash 命令系统。

感谢这些项目的维护者和贡献者在开源协议下发布他们的工作。

---

## 协议

[MIT](LICENSE)
