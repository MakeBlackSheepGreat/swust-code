# 更新日志

## v0.1.0 (2026-06-13)

### 初始版本

基于 OpenCode v1.17.4 构建，移植自 MiMo-Code 和 DevEco Code。

### 核心特性

**持久化记忆系统**
- FTS5 全文搜索 + BM25 排序
- 增量同步引擎（size-mtime 指纹）
- `memory` 搜索工具 + `memory_write` 写入工具
- MEMORY.md 自动注入 system prompt
- 三级作用域：global / project / session

**目标驱动自治**
- `--goal` CLI 参数
- Goal Judge 独立评估
- Task Gate 二级停止条件
- 重入控制（主 12 次 / 子 3 次）

**自我进化**
- Dream 知识提炼（7 天周期）
- Distill 技能发现（30 天周期）
- 自动触发机制

**安全防护**
- 四步权限流水线
- Bash 命令安全分析器
- fail-closed 默认策略

**多 Agent 编排**
- Actor/Spawn 子 Agent 系统
- Fork Cache 对齐
- Coordinator 协议

**工作流引擎**
- QuickJS 沙箱运行时
- Journal 持久化 + 崩溃恢复
- Deep Research 内置工作流

**扩展性**
- 动态工具加载（JSON 声明式）
- NAPI 原生工具桥接
- Workspace 适配器
- 文档验证系统

### 统计

- 53 个新源文件（6,380 行新代码）
- 8 个新测试文件（99 个测试用例，全部通过）
- 24 个 CLI 命令
- 15+ LLM 提供商支持
