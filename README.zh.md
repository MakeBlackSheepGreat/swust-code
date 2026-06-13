# SWUST Code

> 一个会进化的 AI 编程伙伴——记得住、学得会、长得大。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

SWUST Code 是基于 [OpenCode](https://github.com/anomalyco/opencode) 构建的开源 AI 编程智能体，具备**持久记忆**、**目标驱动自治**和**自我进化**能力。

## 核心特性

| 特性 | 说明 |
|------|------|
| **持久记忆** | FTS5 全文检索，跨会话记住项目知识 |
| **目标驱动** | `--goal` 参数设定目标，Agent 自主工作直到完成 |
| **自我进化** | Dream（知识提炼）+ Distill（技能发现）自动运行 |
| **安全防护** | 四步权限流水线 + Bash 命令安全分析 |
| **多 Agent** | Actor/Spawn 子 Agent 编排 + Fork Cache 对齐 |
| **工作流** | 可脚本化的多 Agent 编排 + 崩溃恢复 |

## 快速开始

```bash
# 安装
npm install -g swust-code

# 交互模式
swust-code

# 单次运行
swust-code run "解释这个项目"

# 自治模式
swust-code run --goal "修复所有 TypeScript 错误" "开始工作"
```

## 配置

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "permissions": {
    "bash": "ask",
    "write": "allow"
  }
}
```

## 记忆系统

```
~/.local/share/swust-code/memory/
  global/MEMORY.md              # 跨项目偏好
  projects/<hash>/MEMORY.md     # 项目知识
  sessions/<id>/checkpoint.md   # 会话检查点
```

## 开发

```bash
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code
bun install
bun typecheck
bun turbo test
```

## 致谢

基于 [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co.

参考实现：MiMo-Code（小米）、DevEco Code（华为）、Claude Code（Anthropic）

## 协议

[MIT](LICENSE)
