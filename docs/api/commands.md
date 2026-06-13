# CLI 命令

## 基本命令

| 命令 | 说明 |
|------|------|
| `swust-code` | 启动交互式 TUI |
| `swust-code run [message]` | 运行单次命令 |
| `swust-code run --goal "目标" "消息"` | 自治模式 |
| `swust-code dream` | 知识提炼 |
| `swust-code distill` | 技能发现 |
| `swust-code --help` | 显示帮助 |
| `swust-code --version` | 显示版本 |

## run 命令

```bash
swust-code run [message..]

选项:
  -c, --continue          继续上一个会话
  -s, --session           指定会话 ID
  -m, --model             指定模型 (provider/model)
  --goal                  设定自治目标
  --agent                 指定智能体
  --fork                  分叉会话后再继续
  --share                 分享会话
```

## 管理命令

| 命令 | 说明 |
|------|------|
| `swust-code providers` | 管理 LLM 提供商 |
| `swust-code agent` | 管理智能体 |
| `swust-code mcp list` | 列出 MCP 服务器 |
| `swust-code mcp add` | 添加 MCP 服务器 |
| `swust-code plugin <module>` | 安装插件 |
| `swust-code session` | 管理会话 |
| `swust-code db` | 数据库工具 |
| `swust-code upgrade` | 升级 |
| `swust-code uninstall` | 卸载 |
