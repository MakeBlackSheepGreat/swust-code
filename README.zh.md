<h1 align="center">SWUST Code</h1>

<p align="center">
  <strong>开源 AI 编程智能体，拥有持久记忆、目标驱动自治和自我进化能力。</strong>
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/MakeBlackSheepGreat/swust-code">GitHub</a> | <a href="docs/DIFFERENCES.md">为什么选 SWUST Code？</a> | <a href="docs/quickstart.md">快速开始</a>
</p>

---

SWUST Code 是一个终端原生的 AI 编程智能体，基于 [OpenCode](https://github.com/anomalyco/opencode) 构建。它不仅仅是代码助手——它能**记住**你的项目、**学习**你的工作模式，并随着时间**进化**自身能力。

基于 Effect-TS、SQLite FTS5 和 Vercel AI SDK 构建，支持 15+ 家 LLM 提供商，同一代码库驱动 CLI、TUI、Web 和桌面客户端。

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

配置 LLM 提供商：

```bash
# 设置 API Key（选择一个）
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"

# 交互模式
swust-code

# 单次运行
swust-code run "解释这个项目"

# 自治模式
swust-code run --goal "修复所有 TypeScript 错误" "开始工作"
```

---

## 核心特性

### 持久化记忆

基于 SQLite FTS5 全文搜索的跨会话记忆：

- **项目记忆** (`projects/<id>/MEMORY.md`) — 跨会话持久的项目知识、规则、架构决策
- **全局记忆** (`global/MEMORY.md`) — 跨项目用户偏好
- **会话检查点** (`sessions/<id>/checkpoint.md`) — 结构化 11 段状态快照，每段独立 token 预算
- **会话笔记** (`sessions/<id>/notes.md`) — Agent 临时记录区

Agent 自动索引记忆文件进行全文检索，将相关上下文注入对话，并跨会话持久化知识。

```bash
# Agent 可用的记忆工具：
# memory       — 搜索持久知识（FTS5 + BM25 排序）
# memory_write — 写入结构化知识到记忆文件
```

### 目标驱动自治

设定目标后 Agent 自主工作直到完成：

```bash
swust-code run --goal "将 auth 模块重构为 JWT" "开始工作"
```

- **Goal Judge** — 独立 LLM 评估目标是否真正达成
- **重入控制** — 每个目标最多 12 次重入，防止无限循环
- **Task Gate** — 检查未完成任务的二级停止条件
- **步骤分类器** — 确定性优先级级联用于循环决策

### 自我进化

Agent 从你的使用模式中持续改进：

- **`swust-code dream`** — 扫描近期会话轨迹，将持久知识提炼到项目记忆，移除过时条目（每 7 天自动触发）
- **`swust-code distill`** — 发现重复的手动工作流，将高置信度候选打包为可复用技能（每 30 天自动触发）

### 多智能体编排

| 模式 | 说明 |
|------|------|
| **peer** | 创建新子会话（完全隔离） |
| **subagent** | 共享父会话上下文（不同 actorID） |

- **Actor 注册表** — 生命周期追踪、孤儿恢复、卡住检测
- **Fork Cache 对齐** — 子 Agent 复用父 Agent 的 prompt cache 前缀
- **Coordinator 协议** — 结构化阶段：Research → Synthesis → Implementation → Verification

### 工作流引擎

可脚本化的多 Agent 编排运行时，支持崩溃恢复：

```javascript
// Deep Research 内置工作流
phase('Plan')
const plan = await agent('将问题拆解为搜索行: ' + args)
const results = await parallel(plan.lines.map(line => () => agent('搜索: ' + line)))
// ... Extract → Group → Crosscheck → Report
```

- **Journal 持久化** — JSONL 日志，确定性 key 去重
- **崩溃恢复** — 从最后检查点恢复执行
- **并发控制** — 信号量限制为 `min(16, 2*cores)`

### 安全防护

四步权限流水线 + Bash 命令安全分析：

1. **Blanket deny 规则** — 直接阻止
2. **Blanket ask 规则** — 提示用户确认
3. **工具特定检查** — 每个工具的 `checkPermissions()`
4. **模式覆盖** — bypass/acceptEdits/dontAsk/auto

Bash 安全分析器检测 21 种危险模式（rm -rf、fork bomb、eval、chmod 777、curl|sh 等）。

### 技能系统

在 `.swust-code/skills/<name>/SKILL.md` 中创建自定义技能：

```markdown
---
name: code-review
description: 审查代码变更的正确性、风格和潜在问题
---

# 代码审查技能
...
```

技能从多个来源自动发现，并根据文件路径条件激活。

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

## 支持的提供商

Anthropic、OpenAI、Google、Azure、AWS Bedrock、Groq、Mistral、xAI、Cohere、Perplexity、Together AI、OpenRouter、Cloudflare Workers AI，以及任何 OpenAI 兼容 API。

---

## 开发

```bash
# 克隆
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code

# 安装依赖
bun install

# 运行 CLI
bun run --cwd packages/opencode src/index.ts

# 类型检查
bun typecheck

# 运行测试
bun turbo test
```

---

## 与 OpenCode 的对比

SWUST Code 在 OpenCode 基础上增加了 **6 大核心能力层**：

| 能力 | OpenCode | SWUST Code |
|------|----------|------------|
| 记忆 | 无 | FTS5 + BM25 + 增量同步 |
| 自治 | 无 | Goal Judge + Task Gate + 重入控制 |
| 进化 | 无 | Dream + Distill + 自动触发 |
| 安全 | 基础 | 四步流水线 + Bash 安全 + fail-closed 默认 |
| 编排 | 基础 | Actor + ForkCache + Coordinator |
| 工作流 | 无 | QuickJS 沙箱 + Journal + Deep Research |

详见 [docs/DIFFERENCES.md](docs/DIFFERENCES.md)。

---

## 致谢

基于 [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co.

关键模式移植自：
- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) — 记忆系统、Dream/Distill、Actor/Spawn、工作流引擎
- [DevEco Code](https://github.com/nicognaW/deveco-code) — NAPI 桥接、Workspace 适配器、文档验证
- Claude Code（逆向工程）— 权限流水线、Bash 安全、Coordinator 协议

## 协议

[MIT](LICENSE)
