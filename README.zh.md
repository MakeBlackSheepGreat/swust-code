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

从 MiMo-Code 移植：持久化记忆（FTS5）、Dream/Distill 自我进化、Actor/Spawn 子智能体编排、检查点系统、上下文压缩、工作流引擎、重试策略、死循环检测。

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
- **事实存储** — 每个事实一个 md 文件 + frontmatter，与 FTS5 互补

记忆文件支持 `@path` 导入实现交叉引用。记忆自动在会话恢复时注入上下文。

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

主智能体可按需生成子智能体，两种派生模式：
- **peer** — 创建新子会话（完全隔离）
- **subagent** — 共享父会话上下文（不同 actorID）

子智能体复用父智能体的 prompt cache 前缀（Fork Cache 对齐），降低 token 成本。

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
| `/goal <condition>` | 设定自治目标 |
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
