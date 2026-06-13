<h1 align="center">SWUST Code</h1>

<p align="center"><strong>开源 AI 编程智能体，拥有持久记忆、目标驱动自治和自我进化能力。</strong></p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

---

SWUST Code 是一个终端原生的 AI 编程助手。它能读写代码、执行命令、管理 Git，通过持久化记忆系统，在多次会话间保持对项目的深度理解，并持续自我进化。

SWUST Code 通过 Vercel AI SDK 支持接入各家主流 LLM 厂商 API。

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

当 agent 尝试停止时，独立的 judge 模型会评估对话，判断条件是否真正满足——防止自治工作中的过早停止。每个目标最多重入 12 次。

### Dream & Distill

- **`swust-code dream`** — 扫描近期会话轨迹，将持久知识提炼到项目记忆，移除过时条目（每 7 天自动触发）
- **`swust-code distill`** — 发现重复的手动工作流，将高置信度候选打包为可复用技能（每 30 天自动触发）

### 子智能体系统

主智能体可按需生成子智能体，共享当前会话上下文并行工作，支持生命周期追踪、取消机制和后台执行。两种派生模式：
- **peer** — 创建新子会话（完全隔离）
- **subagent** — 共享父会话上下文（不同 actorID）

### 工作流引擎

可脚本化的多智能体编排运行时，支持崩溃恢复。工作流是运行在沙箱环境中的 JavaScript 脚本，可以派生智能体、并行执行任务、组合结果。内置工作流：Deep Research（6 阶段流水线，带对抗性事实核查）。

### 安全防护

四步权限流水线 + Bash 命令安全分析：

1. Blanket deny 规则 — 直接阻止
2. Blanket ask 规则 — 提示用户确认
3. 工具特定 `checkPermissions()` — 逐工具检查
4. 模式覆盖 — bypass / acceptEdits / dontAsk / auto

Bash 安全分析器检测危险模式（rm -rf、fork bomb、eval、chmod 777、curl|sh 等）并在执行前阻止。

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
- 记忆行为
- MCP 服务器连接
- 键绑定和主题

---

## 开发

```bash
bun install              # 安装依赖
bun run dev              # 开发模式运行
bun turbo typecheck      # 类型检查
bun turbo test           # 运行测试
```

---

## 与 OpenCode 的关系

SWUST Code 基于 [OpenCode](https://github.com/anomalyco/opencode) 的 fork 构建。保留了 OpenCode 的全部核心能力（多 Provider、TUI、LSP、MCP、插件），并在此基础上增加了持久化记忆、目标驱动自治、Dream/Distill 自我进化、多智能体编排、工作流引擎和分层安全。

关键模式移植自：
- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) — 记忆系统、Dream/Distill、Actor/Spawn、工作流引擎
- [DevEco Code](https://github.com/nicognaW/deveco-code) — NAPI 桥接、Workspace 适配器、文档验证

---

## 协议

源代码以 [MIT 协议](./LICENSE) 授权。
