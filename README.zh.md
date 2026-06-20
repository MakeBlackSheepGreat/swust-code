<h1 align="center">龙山灵码</h1>

<p align="center">
  <img src="assets/readme/swust-code-banner.png" alt="龙山灵码" width="700">
</p>

<p align="center">
  <strong>SWUST Code: Where Models and Agents Co-Evolve</strong>
</p>

<p align="center">
  <code>SWUST Code</code>
</p>

<p align="center">
  <a href="https://swust-code.dev"><img src="https://img.shields.io/badge/docs-live-brightgreen" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=social" alt="Stars"></a>
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

---

龙山灵码（SWUST Code）是一个终端原生 AI 编程智能体，基于 [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) fork 构建。它优先继承 MiMo-Code 的原生基础能力：多 Provider 模型路由、TUI、LSP、MCP、插件、持久化记忆、checkpoint、actor / subagent 编排、任务追踪、goal 停止条件、Compose 工作流、Dream / Distill 自我进化，以及语音输入。

在这个基础上，龙山灵码增加了 SWUST 品牌层、中文优先的产品体验、更完整的侧边栏上下文、attention 通知、任务完成 gate、文档验证、cache-stable 上下文优化、`@path` 记忆导入，以及 one-fact-per-file 记忆存储。

> **[阅读文档](https://swust-code.dev/docs/)** — 安装、配置、Provider、TUI、Agent、权限、MCP、插件和开发者指南。

---

## 项目定位

这个 fork 遵循一个简单原则：**MiMo-Code 已经具备的能力，以 MiMo-Code 原生实现为主；MiMo-Code 没有的能力，再由 SWUST 层补齐。**

| 层级 | 提供能力 |
|------|----------|
| **MiMo-Code 基座** | Provider 集成、TUI/server 运行时、LSP、MCP、插件、记忆、checkpoint、actor/subagent、任务、goal、Compose、Dream/Distill、语音 |
| **SWUST 层** | 龙山灵码品牌、中文本地化、SWUST 侧边栏/attention 体验、任务 gate 策略、文档验证、记忆导入/fact-store 工具、cache-stable prompt 布局 |
| **兼容层** | OpenAI 兼容 Provider、MiMo 语音模型配置、Claude Code 认证导入、项目/全局配置文件 |

AI 服务商名称会保持原样。`MiMo Auto`、`小米 MiMo 平台`、`mimo/mimo-auto`、`xiaomi/mimo-*` 等模型 ID 指向原服务商能力，不做品牌改名。

---

## 快速开始

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/MakeBlackSheepGreat/swust-code/main/install | bash

# 或通过 npm 安装
npm install -g @swust-code/cli

# 运行
swust-code
```

首次启动会自动引导配置：

- **MiMo Auto（限时免费）** — 匿名通道，零配置
- **小米 MiMo 平台** — OAuth 登录
- **从 Claude Code 导入** — 一步迁移已有认证
- **自定义 Provider** — 在 TUI 内添加任意 OpenAI 兼容 API

<details>
<summary><strong>WSL：剪贴板问题</strong></summary>

如果在 WSL 上复制出现乱码，安装 `xsel`：

```bash
sudo apt install xsel
```

</details>

---

## 核心特性

### 智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认开发智能体，具备完整工具权限 |
| **plan** | 只读分析模式，适合代码探索和方案设计 |
| **compose** | 结构化编排模式，适合 specs-driven 和 skill-driven 工作流 |
| **goal** | 自主目标模式，持续工作到请求完成、完成验证或明确受阻 |

按 `Tab` 可以在主智能体间切换。运行时可按需创建子智能体，追踪生命周期、取消任务、后台执行，并把子智能体工作与父会话保持关联。

### 记忆与 Checkpoint

持久化记忆基于 SQLite FTS5 搜索，并继承 MiMo-Code 的 checkpoint 栈：

- **项目记忆** (`MEMORY.md`) — 项目知识、规则和架构决策
- **会话检查点** (`checkpoint.md`) — 自动维护的结构化状态快照
- **笔记暂存** (`notes.md`) — Agent 临时记录区
- **任务进展** (`tasks/<id>/progress.md`) — 按任务记录的执行日志
- **Fact store** — 每个事实一个 markdown 文件，带 frontmatter 和生成索引
- **`@path` 导入** — 记忆文档内联引用其他文件

当会话恢复或接近上下文上限时，龙山灵码会从 checkpoint、记忆、笔记、任务进展和近期对话中重建有效上下文，避免 agent 重新理解项目。

### Goal 与任务 Gate

`/goal` 可为当前会话设置自主停止条件。当 agent 尝试停止时，独立 judge 模型会评估目标是否真正满足。任务 gate 会进一步检查未完成任务状态，避免主 agent 或符合条件的子 agent 过早结束。

### Compose 工作流

Compose 模式继承 MiMo-Code 的结构化开发流程：规划、实现、审查、TDD、调试、验证、合并等阶段可通过内置 skills 和 subagents 协同执行。

### TUI 侧边栏与 Attention

SWUST TUI 保留 MiMo/OpenTUI 的终端体验，并加入更适合实际开发的侧边栏：

- 工作目录与指令文件可见性
- goal、task、todo、LSP、MCP、变更文件等区块
- 上下文窗口健康度、token 用量、运行状态、费用和缓存指标
- 免费模型与 Provider 配置的 getting-started 提示
- 可配置的 attention 通知与声音包

### 安全与验证

龙山灵码保留 Provider / Tool 权限模型，并在 SWUST 层加入更严格的防护：

- 未完成任务的 task gate 检查
- 高风险 Bash 命令执行前的安全分析
- 面向 spec-driven 文件的文档验证工具
- 记忆写入路径保护
- cache-stable prompt 前缀，提高 Provider 缓存命中率

### 语音输入

语音输入基于 TenVAD 和 MiMo ASR 实现实时流式转写。通过 `/voice` 激活后，音频会按停顿分片，并逐段追加到输入框。MiMo 托管 ASR 需要 MiMo 登录，并依赖 `sox`（macOS 上 `brew install sox`，其他平台安装对应包）。

<details>
<summary><strong>WSLg 音频配置</strong></summary>

```bash
sudo apt install -y sox pulseaudio libasound2-plugins
export PULSE_SERVER=unix:/mnt/wslg/PulseServer
```

</details>

<details>
<summary><strong>SSH 远程音频（Mac -> 远程主机）</strong></summary>

```bash
# Mac（本地）
brew install pulseaudio
pulseaudio --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1" --exit-idle-time=-1 --daemonize
# 在 ~/.ssh/config 中添加: RemoteForward 4713 127.0.0.1:4713

# 远程主机
apt install -y pulseaudio pulseaudio-utils sox
export PULSE_SERVER=tcp:127.0.0.1:4713
# 验证: pactl info
```

</details>

<details>
<summary><strong>非 MiMo 渠道语音输入（OpenRouter、内部 API 等）</strong></summary>

语音输入可通过 `voice` 配置字段路由到其他 OpenAI 兼容 provider。ASR 模型（`mimo-v2.5-asr`）仅在 MiMo 平台可用；语音控制模式（`mimo-v2.5`）可通过 OpenRouter 和兼容中转平台使用。

**OpenRouter（仅语音控制）：**

使用 `/connect` 连接 OpenRouter 后添加：

```jsonc
{
  "voice": {
    "control_model": "openrouter/xiaomi/mimo-v2.5"
  }
}
```

**内部 / 自建中转平台（ASR + 语音控制）：**

```jsonc
{
  "provider": {
    "internal": {
      "options": {
        "baseURL": "https://your-api-gateway.example.com/v1",
        "apiKey": "sk-..."
      },
      "models": {
        "xiaomi/mimo-v2.5-asr": { "name": "MiMo-V2.5-ASR" },
        "xiaomi/mimo-v2.5": { "name": "MiMo-V2.5" }
      }
    }
  },
  "voice": {
    "asr_model": "internal/xiaomi/mimo-v2.5-asr",
    "control_model": "internal/xiaomi/mimo-v2.5"
  }
}
```

自定义 provider 必须在 `models` 中注册至少一个模型才能被系统识别。`voice.*_model` 中的模型名会直接传给 API，不必与注册的 key 完全一致。

</details>

### Dream & Distill

- **`/dream`** — 扫描近期会话轨迹，将持久知识提取到项目记忆，并清理过时条目
- **`/distill`** — 发现重复工作流，将高置信度候选打包成可复用 skill、subagent 或 command

---

## 配置

龙山灵码使用 `swust-code.json` / `swust-code.jsonc` 管理运行时配置，使用 `tui.json` / `tui.jsonc` 管理 TUI 专属配置。

常见位置：

- 全局运行时配置：`~/.config/swust-code/swust-code.json`
- 全局 TUI 配置：`~/.config/swust-code/tui.json`
- 项目运行时配置：项目根目录的 `swust-code.json`
- 项目 TUI 配置：项目根目录的 `tui.json`

主要配置范围包括 Provider、模型、权限、Agent、命令、MCP server、插件、记忆/checkpoint 行为、快捷键、主题，以及 Max Mode 等实验性能力。

---

## 架构

```text
┌──────────────────────────────────────────────────────────┐
│                  CLI / TUI / Web / Desktop               │
├──────────────────────────────────────────────────────────┤
│                    Session Runtime                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │ Memory      │ │ Checkpoint  │ │ Goal / Task Gates   │ │
│  │ Context     │ │ Compaction  │ │ Compose / Actors    │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│        Tools / Permissions / MCP / LSP / Plugins          │
├──────────────────────────────────────────────────────────┤
│        SQLite FTS5 + Drizzle ORM + Effect-TS + Bun        │
└──────────────────────────────────────────────────────────┘
```

| 领域 | 技术 |
|------|------|
| 运行时 | Bun 1.3.11 |
| Effect 系统 | Effect-TS 4 beta |
| 数据库 | SQLite + Drizzle ORM + FTS5 |
| LLM 集成 | Vercel AI SDK 与 OpenAI 兼容 Provider |
| 终端 UI | SolidJS + OpenTUI |
| Monorepo | Bun workspaces + Turborepo |

---

## 开发

```bash
bun install              # 安装依赖
bun run dev              # 以开发模式运行 CLI
bun turbo typecheck      # 检查全部包类型
```

包和命令名称：

- npm 包：`@swust-code/cli`
- CLI 命令：`swust-code`
- 仓库包管理器：`bun@1.3.11`

---

## 文档

完整文档请访问 **[swust-code.dev/docs](https://swust-code.dev/docs/)**。

---

## 社区

扫描二维码加入社区群聊：

<p align="center">
  <img src="assets/readme/community-qrcode.jpg" alt="社区群聊二维码" width="240">
</p>

---

## 致谢

龙山灵码建立在多个开源项目的工作之上：

- [**MiMo-Code**](https://github.com/XiaomiMiMo/MiMo-Code) by 小米 — 当前 fork 的基座，提供原生记忆、checkpoint、actor、goal、Compose、Dream/Distill、语音、TUI、Provider、MCP、LSP 和插件体系。
- [**OpenCode**](https://github.com/anomalyco/opencode) by Anomaly Co. — 终端原生 coding agent 生态中的重要上游传承。
- [**DevEco Code**](https://github.com/nicognaW/deveco-code) by nicognaW — SWUST 层文档验证思路的参考来源。
- [**DeepSeek-Reasonix**](https://github.com/esengine/DeepSeek-Reasonix) by esengine — SWUST 层 cache-stable 上下文与记忆组织思路的参考来源。

感谢这些项目的维护者和贡献者在开源协议下发布他们的工作。

---

## 许可证

源代码基于 [MIT 许可证](./LICENSE) 开源。

使用龙山灵码还需遵守[使用限制](./USE_RESTRICTIONS.md)。使用小米 MiMo 托管服务须遵守 [MiMo 服务条款](https://platform.xiaomimimo.com/docs/terms/user-agreement)。使用 MiMo 名称、标志和商标须遵守 MiMo 商标政策。
