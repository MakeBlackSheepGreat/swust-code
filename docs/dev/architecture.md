# 架构设计

## 五层架构

```
┌─────────────────────────────────────────────────┐
│           Interface Layer                        │
│  CLI / TUI / Web / Desktop / API Server          │
├─────────────────────────────────────────────────┤
│           Extension Layer                        │
│  Plugin API / Skills / MCP / NAPI Bridge         │
├─────────────────────────────────────────────────┤
│           Intelligence Layer                     │
│  Agent Orchestrator / Memory / Goal / Dream      │
├─────────────────────────────────────────────────┤
│           Engine Layer                           │
│  Session / LLM Client / Tool Registry / Perm     │
├─────────────────────────────────────────────────┤
│           Foundation Layer                       │
│  Effect-TS / SQLite+Drizzle / EventBus / Config  │
└─────────────────────────────────────────────────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Bun 1.3.14 |
| 效果系统 | Effect-TS 4.0 beta |
| 数据库 | SQLite + Drizzle ORM + FTS5 |
| LLM | Vercel AI SDK (15+ 提供商) |
| 前端 | SolidJS + OpenTUI |
| 包管理 | Bun + Turborepo |

## Monorepo 结构

```
swust-code/
├── packages/
│   ├── core/          # 基础层：数据库、配置、事件、文件系统
│   ├── llm/           # LLM 抽象层
│   ├── engine/        # 引擎层：Session、Tool、Permission
│   ├── intelligence/  # 智能层：Memory、Goal、Dream、Workflow
│   ├── extension/     # 扩展层：Plugin、Skills、MCP、NAPI
│   ├── cli/           # CLI 入口
│   ├── tui/           # 终端 UI
│   ├── app/           # Web 前端
│   ├── server/        # API 服务器
│   └── sdk/           # JS SDK
├── docs/              # 文档站 (VitePress)
├── .swust-code/       # 项目级配置
└── patches/           # Bun 依赖补丁
```

## 核心设计模式

### Effect-TS 服务层
```ts
export class Service extends Context.Service<Service, Interface>()("@swust-code/Memory") {}
export const layer = Layer.effect(Service, Effect.gen(function* () { ... }))
export const defaultLayer = layer.pipe(Layer.provide(Dependency.defaultLayer))
```

### 工具注册
```ts
Tool.make({
  description: "...",
  input: Schema.Struct({ ... }),
  output: Schema.Struct({ ... }),
  execute: (input, context) => Effect.gen(function* () { ... }),
})
```

### 系统上下文注入
```ts
SystemContext.make({
  key: SystemContext.Key.make("core/memory"),
  codec: Schema.toCodecJson(State),
  load: Effect.succeed({ fileCount }),
  baseline: render,
})
```
