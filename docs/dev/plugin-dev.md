# 插件开发

## 插件结构

```ts
// my-plugin.ts
export default async function(input: PluginInput): Promise<Hooks> {
  return {
    // 工具定义
    tool: {
      myTool: Tool.make({
        description: "我的自定义工具",
        input: Schema.Struct({ query: Schema.String }),
        output: Schema.Struct({ result: Schema.String }),
        execute: (input) => Effect.succeed({ result: `Hello ${input.query}` }),
      }),
    },
    // 生命周期钩子
    chat: {
      message: async (message) => { /* 处理消息 */ },
    },
    permission: {
      ask: async (context) => { /* 自定义权限逻辑 */ },
    },
  }
}
```

## 安装插件

```bash
# 在 TUI 内
/plugin my-plugin

# 或在配置文件中
{
  "plugins": ["./path/to/my-plugin.ts"]
}
```

## 插件 API

| 钩子 | 说明 |
|------|------|
| `chat.message` | 消息处理 |
| `permission.ask` | 权限询问 |
| `tool.execute.before` | 工具执行前 |
| `tool.execute.after` | 工具执行后 |
| `shell.env` | Shell 环境变量 |
| `session.compacting` | 会话压缩 |
