# 工作流引擎

可脚本化的多 Agent 编排运行时，支持崩溃恢复。

## 内置工作流

### Deep Research

6 阶段研究工作流：

1. **Plan** — 将问题拆解为 3-6 个搜索行
2. **Search** — 并行搜索每个方向
3. **Extract** — 从源中提取事实
4. **Group** — 去重和分组
5. **Crosscheck** — 3 个独立陪审员投票验证
6. **Report** — 生成带引用的研究报告

## 自定义工作流

工作流是 JavaScript 脚本，使用 host 函数编排：

```javascript
export const meta = {
  name: 'my-workflow',
  description: '自定义工作流',
  phases: [{ title: 'Phase 1' }],
}

phase('Phase 1')
const result = await agent('执行任务: ' + args)
const results = await parallel([
  () => agent('子任务 1'),
  () => agent('子任务 2'),
])
return results
```

## Host 函数

| 函数 | 说明 |
|------|------|
| `agent(prompt, opts?)` | 派生子 Agent 执行任务 |
| `parallel(thunks)` | 并行执行多个任务 |
| `pipeline(items, ...stages)` | 流水线处理 |
| `phase(title)` | 标记阶段 |
| `log(message)` | 输出日志 |

## 崩溃恢复

- 每个操作写入 JSONL journal 文件
- 确定性 key（sha256）去重
- 脚本变更时自动清空 journal
- 从最后检查点恢复执行
