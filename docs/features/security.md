# 安全防护

SWUST Code 采用分层安全模型，确保 Agent 在自治模式下安全可控。

## 四步权限流水线

工具调用经过四层检查：

```
1. Blanket deny 规则  → 命中则直接拒绝
2. Blanket ask 规则   → 命中则提示用户确认
3. tool.checkPermissions() → 工具自定义检查
4. Mode 覆盖         → bypass/acceptEdits/dontAsk/auto
```

## Bash 安全分析

在执行 Bash 命令前，自动分析危险模式：

### 禁止执行（dangerous）

| 模式 | 说明 |
|------|------|
| `rm -rf /` | 递归删除根目录 |
| `curl \| sh` | 下载并执行脚本 |
| `eval` | 动态代码执行 |
| `chmod 777` | 全局可写权限 |
| `:(){ :\|:& };:` | Fork bomb |
| `kill -9 -1` | 杀死所有进程 |

### 需确认（caution）

| 模式 | 说明 |
|------|------|
| `rm file` | 文件删除 |
| `mv` | 文件移动 |
| `git push --force` | 强制推送 |
| `git reset --hard` | 硬重置 |

## 工具权限属性

每个工具有三个安全属性：

| 属性 | 默认值 | 说明 |
|------|--------|------|
| `isReadOnly` | false | 是否只读操作 |
| `isConcurrencySafe` | false | 是否可并行执行 |
| `isDestructive` | true | 是否有破坏性 |

**Fail-closed 默认**：新工具默认最严格权限，必须显式放宽。

## 权限模式

| 模式 | 说明 |
|------|------|
| `default` | 标准四步流水线 |
| `bypass` | 跳过所有检查（危险） |
| `acceptEdits` | 自动允许编辑操作 |
| `dontAsk` | 未知操作自动拒绝 |
| `auto` | 使用 AI 分类器自动决策 |
