# 贡献指南

## 环境要求

- Bun 1.3+
- Node.js 20+（某些原生模块需要）
- Git

## 开发流程

```bash
# 克隆
git clone https://github.com/MakeBlackSheepGreat/swust-code.git
cd swust-code

# 安装依赖
bun install

# 开发模式
bun run dev

# 类型检查
bun turbo typecheck

# 运行测试
bun turbo test
```

## 代码规范

- **错误处理**：Effect-TS `Effect.gen` + 显式 Error 类型
- **状态管理**：`State.create<Data, Editor>` + Immer
- **服务定义**：`Context.Service` + `Layer.effect` + `defaultLayer`
- **工具注册**：`Tool.make({ description, input, output, execute })`
- **测试**：Bun test runner

## 分支策略

- `main` — 稳定版本
- `dev` — 开发分支
- 功能分支：`feature/<name>`
- 修复分支：`fix/<name>`

## 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档
chore: 杂项
refactor: 重构
test: 测试
```
