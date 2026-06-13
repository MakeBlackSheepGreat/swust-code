# 目标驱动自治

通过 `--goal` 参数设定目标，Agent 自主工作直到目标达成。

## 使用方式

```bash
swust-code run --goal "修复所有 TypeScript 类型错误" "开始工作"
```

## 工作流程

1. 用户设定 goal（如 "修复所有 lint 错误"）
2. Agent 开始工作，执行工具调用
3. 当 Agent 想要停止时，**Goal Gate** 触发
4. **Goal Judge**（独立 LLM）评估对话转录
5. 如果目标未达成：注入合成消息，Agent 继续工作
6. 如果目标达成或不可能：正常停止

## Goal Judge

独立的 LLM 评估器，使用专门的系统提示：

- 读取完整对话转录（保留 tool call/result）
- 温度设为 0，确保确定性
- 返回 `{ ok: boolean, impossible?: boolean, reason: string }`
- **关键设计**：禁止盲从 Agent 的自评

## 重入控制

| 角色 | 最大重入次数 |
|------|------------|
| 主 Agent | 12 次 |
| 子 Agent | 3 次 |

超过上限后强制停止，防止无限循环。

## Task Gate

二级停止条件：检查 todowrite 工具中的 non-terminal tasks。如果存在未完成的任务，强制 Agent 继续工作。
