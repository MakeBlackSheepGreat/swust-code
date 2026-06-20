<h1 align="center">龙山灵码</h1>

<p align="center">
  <strong>SWUST Code · 基于 MiMo-Code 的终端原生 AI 编程智能体</strong>
</p>

<p align="center">
  中文 · <a href="README.md">English</a> ·
  <a href="https://swust-code.dev">文档站</a> ·
  <a href="https://github.com/MakeBlackSheepGreat/swust-code">GitHub</a>
</p>

<p align="center">
  <a href="https://swust-code.dev"><img src="https://img.shields.io/badge/docs-live-1d4ed8?style=flat-square" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-64748b?style=flat-square" alt="License"></a>
  <a href="https://github.com/MakeBlackSheepGreat/swust-code"><img src="https://img.shields.io/github/stars/MakeBlackSheepGreat/swust-code?style=flat-square&color=0f766e" alt="Stars"></a>
  <img src="https://img.shields.io/badge/version-0.6.0-2563eb?style=flat-square" alt="Version">
</p>

> [!IMPORTANT]
> 龙山灵码是基于 MiMo-Code 的 fork。维护原则很明确：MiMo-Code 已经具备的能力，以 MiMo 原生实现为主；MiMo-Code 没有的能力，再由 SWUST 层补齐。

## 这是什么

龙山灵码（SWUST Code）是一个面向长任务的软件工程 Agent。它可以读写代码、运行命令、管理会话、使用 MCP / LSP / 插件、维护项目长期记忆、编排子智能体，并围绕明确目标持续推进。

CLI 命令是：

```bash
swust-code
```

AI 服务商名称保持原样。`MiMo Auto`、`小米 MiMo 平台`、`mimo/mimo-auto`、`xiaomi/mimo-*` 都指向原服务商或模型 ID，不做品牌改名。

## 快速开始

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/MakeBlackSheepGreat/swust-code/main/install | bash

# 或通过 npm 安装
npm install -g @swust-code/cli

# 启动 TUI
swust-code
```

首次启动会进入 Provider 配置向导：

| 选项 | 适用场景 |
|------|----------|
| **MiMo Auto** | 想使用零配置的限时免费通道 |
| **小米 MiMo 平台** | 想通过 MiMo OAuth 登录 |
| **从 Claude Code 导入** | 已经有 Claude Code 凭证 |
| **自定义 Provider** | 使用 OpenAI 兼容网关或其他模型服务商 |

## 常用命令

| 命令 | 用途 |
|------|------|
| `swust-code` | 启动交互式 TUI |
| `swust-code run "解释这个仓库"` | 从 shell 运行一次提示 |
| `swust-code run --goal "修复类型错误" "开始"` | 带自治停止条件运行 |
| `/goal <目标>` | 在 TUI 内设置目标 |
| `/memory <查询>` | 搜索持久化项目记忆 |
| `/dream` | 从近期会话中整合长期项目知识 |
| `/distill` | 将重复工作流沉淀为 skill、subagent 或 command |
| `/subagent`、`/subagents` | 为可见子智能体配置项目级模型、思考强度和最大执行步数 |
| `/paste-image` | 从剪贴板附加图片 |
| `/model`、`/agent`、`/mcp`、`/skill`、`/effort` | 用常见别名打开现有 MiMo/SWUST TUI 控件 |

## 核心能力

### MiMo-Code 基座

龙山灵码继承 MiMo-Code 当前主线能力：

- 终端 TUI、server runtime、Web / Desktop 入口
- 多 Provider 模型路由与 OpenAI 兼容服务商
- LSP、MCP、插件、自定义命令、技能系统
- 持久化记忆、checkpoint、上下文重建
- actor / subagent 编排与任务追踪
- `goal`、`compose`、Dream / Distill、语音输入

### SWUST 层

SWUST 层聚焦品牌、中文体验和工程防护：

- 龙山灵码品牌与中文本地化
- 更完整的侧边栏上下文：goal、task、todo、LSP、MCP、变更文件、token、费用、缓存状态
- 子智能体项目级个性化设置：模型、思考强度和最大执行步数
- attention 通知与声音包配置
- agent 停止前的未完成任务 gate
- Bash 命令安全分析
- 文档验证工具
- cache-stable 上下文布局
- `@path` 记忆导入与 one-fact-per-file 记忆存储

## 智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认开发智能体，具备完整工具权限 |
| **plan** | 只读探索和方案设计 |
| **compose** | 面向 spec、skill、评审、TDD、验证、合并的结构化编排 |
| **goal** | 持续工作，直到独立 judge 判断停止条件已满足 |

在 TUI 中按 `Tab` 可以切换主智能体。运行时可按需创建调查、实现、评审和 checkpoint writer 子智能体，并保留父会话上下文。

## 记忆与 Checkpoint

龙山灵码会跨会话保留项目知识：

```text
~/.local/share/swust-code/memory/
  global/MEMORY.md
  projects/<project-id>/MEMORY.md
  projects/<project-id>/facts/<fact>.md
  sessions/<session-id>/checkpoint.md
  sessions/<session-id>/notes.md
  sessions/<session-id>/tasks/<task-id>/progress.md
```

记忆通过 SQLite FTS5 搜索，并在会话恢复或接近上下文上限时和 checkpoint 一起重建上下文。长任务中，Agent 不需要反复重新理解项目。

## 配置

运行时配置使用 `swust-code.json` 或 `swust-code.jsonc`。

常见位置：

- 全局运行时配置：`~/.config/swust-code/swust-code.json`
- 项目运行时配置：项目根目录的 `swust-code.json`
- 全局 TUI 配置：`~/.config/swust-code/tui.json`
- 项目 TUI 配置：项目根目录的 `tui.json`

配置范围包括 Provider、模型、权限、Agent、命令、MCP server、插件、记忆 / checkpoint 行为、快捷键、主题和实验性功能。

## 开发

```bash
bun install
bun run dev
bun turbo typecheck
```

维护者发布 npm 版本时，需要先配置仓库 Secret `NPM_TOKEN`，再推送与 `packages/opencode/package.json` 一致的语义化 tag：

```bash
git tag v0.6.0
git push swust-code v0.6.0
```

| 项目 | 值 |
|------|----|
| npm 包 | `@swust-code/cli` |
| CLI 命令 | `swust-code` |
| 包管理器 | `bun@1.3.11` |
| 当前声明版本 | `0.6.0` |

## 文档

- **文档站：** <https://swust-code.dev>
- **快速开始：** <https://swust-code.dev/guide/start>
- **命令参考：** <https://swust-code.dev/api/commands>
- **架构说明：** <https://swust-code.dev/dev/architecture>

## 致谢

龙山灵码建立在这些开源项目之上：

- [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) by 小米：当前运行时、TUI、Provider、记忆、checkpoint、actor、goal、Compose、Dream/Distill、语音、MCP、LSP 和插件体系的基座。
- [OpenCode](https://github.com/anomalyco/opencode)：终端原生 coding agent 生态中的重要上游传承。
- [DevEco Code](https://github.com/nicognaW/deveco-code)：文档验证思路的参考来源。
- [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix)：cache-stable 上下文与记忆组织思路的参考来源。

## 许可证

源代码基于 [MIT 许可证](./LICENSE) 开源。

使用龙山灵码还需遵守[使用限制](./USE_RESTRICTIONS.md)。使用小米 MiMo 托管服务须遵守 [MiMo 服务条款](https://platform.xiaomimimo.com/docs/terms/user-agreement)。使用 MiMo 名称、标志和商标须遵守 MiMo 商标政策。
