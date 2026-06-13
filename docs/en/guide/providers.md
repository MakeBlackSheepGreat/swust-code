# LLM Providers

SWUST Code supports 15+ LLM providers via the Vercel AI SDK.

## Supported Providers

| Provider | Env Variable | Recommended Model |
|----------|--------------|-------------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Google | `GOOGLE_API_KEY` | gemini-2.5-pro |
| Azure | `AZURE_API_KEY` | gpt-4o |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` | claude-sonnet-4-6 |
| Groq | `GROQ_API_KEY` | llama-3.3-70b |
| Mistral | `MISTRAL_API_KEY` | mistral-large-latest |

## Configuration

```bash
export ANTHROPIC_API_KEY="your-key"
swust-code
```

Or configure in TUI via `/providers` command.
