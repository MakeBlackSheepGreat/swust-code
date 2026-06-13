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

SWUST Code 基于 Anomaly Co. 的 [OpenCode](https://github.com/anomalyco/opencode) 构建，核心能力移植自小米的 [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) 和 nicognaW 的 [DevEco Code](https://github.com/nicognaW/deveco-code)。保留了 OpenCode 的全部核心能力（多 Provider、TUI、LSP、MCP、插件），并在此基础上增加了持久化记忆、目标驱动自治、自我进化、多智能体编排、工作流引擎和分层安全。

从 MiMo-Code 移植：持久化记忆（FTS5）、Dream/Distill 自我进化、Actor/Spawn 子智能体编排、检查点系统、上下文压缩、工作流引擎。

从 DevEco Code 移植：NAPI 原生工具桥接、Workspace 适配器模式、文档验证系统。

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

### 多智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认。完整工具权限，用于开发 |
| **plan** | 只读分析模式，适合代码探索和方案设计 |
| **explore** | 快速只读搜索智能体，用于定位代码 |

按 `Tab` 在主智能体间切换。子智能体由系统按需生成。

### 持久化记忆

基于 SQLite FTS5 全文搜索的跨会话记忆：

- **项目记忆** (`MEMORY.md`) — 跨会话持久的项目知识、规则、架构决策
- **全局记忆** (`global/MEMORY.md`) — 跨项目用户偏好
- **会话检查点** (`checkpoint.md`) — 结构化 11 段状态快照，每段独立 token 预算
- **会话笔记** (`notes.md`) — Agent 临时记录区

记忆自动在会话恢复时注入上下文，agent 无需重新理解项目背景。提供两个工具：
- `memory` — 搜索持久知识（FTS5 + BM25 排序）
- `memory_write` — 写入结构化知识到记忆文件

### 目标驱动自治

通过 `--goal` 参数设定停止条件：

```bash
swust-code run --goal "修复所有 TypeScript 错误" "开始工作"
```

当 agent 尝试停止时，独立的 judge 模型会评估对话，判断条件是否真正满足——防止自治工作中的过早停止。每个目标最多重入 12 次。二级 task gate 在允许 agent 停止前检查未完成的任务。

### Dream & Distill

- **`swust-code dream`** — 扫描近期会话轨迹，将持久知识提炼到项目记忆，移除过时条目（每 7 天自动触发）
- **`swust-code distill`** — 发现重复的手动工作流，将高置信度候选打包为可复用技能（每 30 天自动触发）

### 子智能体系统

主智能体可按需生成子智能体，共享当前会话上下文并行工作，支持生命周期追踪、取消机制和后台执行。两种派生模式：
- **peer** — 创建新子会话（完全隔离）
- **subagent** — 共享父会话上下文（不同 actorID）

子智能体复用父智能体的 prompt cache 前缀（Fork Cache 对齐），降低 token 成本。

### 工作流引擎

可脚本化的多智能体编排运行时，支持崩溃恢复。工作流是运行在沙箱环境中的 JavaScript 脚本，可以派生智能体、并行执行任务、组合结果。

- **Journal 持久化** — JSONL 日志，确定性 key 去重
- **崩溃恢复** — 从最后检查点恢复执行
- **并发控制** — 信号量限制为 `min(16, 2*cores)`
- **内置工作流** — Deep Research（6 阶段流水线，带对抗性陪审团投票）

### 安全防护

四步权限流水线 + Bash 命令安全分析：

1. Blanket deny 规则 — 直接阻止
2. Blanket ask 规则 — 提示用户确认
3. 工具特定 `checkPermissions()` — 逐工具检查
4. 模式覆盖 — bypass / acceptEdits / dontAsk / auto

Bash 安全分析器检测危险模式（rm -rf、fork bomb、eval、chmod 777、curl|sh 等）并在执行前阻止。工具默认 fail-closed：`isReadOnly=false`，`isDestructive=true`。

### 技能系统

在 `.swust-code/skills/<name>/SKILL.md` 中创建自定义技能：

```markdown
---
name: code-review
description: 审查代码变更的正确性和风格
---

# 技能说明...
```

技能从多个来源自动发现，并根据文件路径条件激活。

---

## 配置

SWUST Code 通过项目目录下的 `.swust-code/config.json` 配置（全局配置在 `~/.config/swust-code/config.json`）。主要选项包括：

- Provider 和模型选择
- 智能体权限
- 记忆行为（`memory_reconcile_on_search`、`memory_search_score_floor`）
- MCP 服务器连接
- 键绑定和主题

详见[配置指南](https://swust-code-docs.pages.dev/guide/config)。

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

完整文档请访问 **[swust-code-docs.pages.dev](https://swust-code-docs.pages.dev)**：

- [快速开始](https://swust-code-docs.pages.dev/guide/start)
- [安装指南](https://swust-code-docs.pages.dev/guide/install)
- [配置说明](https://swust-code-docs.pages.dev/guide/config)
- [LLM 提供商](https://swust-code-docs.pages.dev/guide/providers)
- [持久化记忆](https://swust-code-docs.pages.dev/features/memory)
- [目标驱动自治](https://swust-code-docs.pages.dev/features/goal)
- [Dream & Distill](https://swust-code-docs.pages.dev/features/dream)
- [安全防护](https://swust-code-docs.pages.dev/features/security)
- [工作流引擎](https://swust-code-docs.pages.dev/features/workflow)
- [技能系统](https://swust-code-docs.pages.dev/features/skills)
- [CLI 命令](https://swust-code-docs.pages.dev/api/commands)
- [架构设计](https://swust-code-docs.pages.dev/dev/architecture)

---

## 致谢

SWUST Code 站在三个开源项目的肩膀上：

- [**OpenCode**](https://github.com/anomalyco/opencode) by Anomaly Co. — 基座。所有核心能力（多 Provider LLM、TUI、LSP、MCP、插件系统）来自 OpenCode。
- [**MiMo-Code**](https://github.com/XiaomiMiMo/MiMo-Code) by 小米 — 持久化记忆（FTS5）、Dream/Distill 自我进化、Actor/Spawn 编排、检查点系统、上下文压缩、工作流引擎。
- [**DevEco Code**](https://github.com/nicognaW/deveco-code) by nicognaW — NAPI 原生工具桥接、Workspace 适配器模式、文档验证系统。

感谢这些项目的维护者和贡献者在开源协议下发布他们的工作。

---

## 协议

[MIT](LICENSE)
