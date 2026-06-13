# LLM 提供商

SWUST Code 通过 Vercel AI SDK 支持 15+ 家 LLM 提供商。

## 支持的提供商

| 提供商 | 环境变量 | 推荐模型 |
|--------|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Google | `GOOGLE_API_KEY` | gemini-2.5-pro |
| Azure | `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` | gpt-4o |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | claude-sonnet-4-6 |
| Groq | `GROQ_API_KEY` | llama-3.3-70b |
| Mistral | `MISTRAL_API_KEY` | mistral-large-latest |
| xAI | `XAI_API_KEY` | grok-3 |
| Cohere | `COHERE_API_KEY` | command-r-plus |
| OpenRouter | `OPENROUTER_API_KEY` | 各种模型 |

## 配置方式

### 方式 1：环境变量

```bash
export ANTHROPIC_API_KEY="your-key"
swust-code
```

### 方式 2：TUI 内配置

启动后执行 `/providers` 命令，在 TUI 内配置 API Key。

### 方式 3：配置文件

```json
{
  "model": "anthropic/claude-sonnet-4-6"
}
```

## 自定义 Provider

支持任何 OpenAI 兼容 API：

```bash
# 在 TUI 内添加
/providers add

# 或在配置文件中
{
  "providers": {
    "my-provider": {
      "type": "openai-compatible",
      "baseURL": "https://my-api.example.com/v1",
      "apiKey": "my-key"
    }
  }
}
```
