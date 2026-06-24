import { describe, expect, test } from "bun:test"
import {
  CUSTOM_PROVIDER_CONNECTIONS,
  buildCustomProviderPatch,
} from "../../../src/cli/cmd/tui/component/dialog-provider"

describe("custom provider wizard", () => {
  test.each([
    ["openai-compatible", "@ai-sdk/openai-compatible", { baseURL: "https://example.com/v1", setCacheKey: true }],
    ["openai", "@ai-sdk/openai", { baseURL: "https://example.com/v1" }],
    ["anthropic", "@ai-sdk/anthropic", { baseURL: "https://example.com/v1" }],
  ] as const)("builds provider config for %s connection", (connectionValue, npm, options) => {
    const connection = CUSTOM_PROVIDER_CONNECTIONS.find((item) => item.value === connectionValue)
    if (!connection) throw new Error(`missing connection ${connectionValue}`)

    const patch = buildCustomProviderPatch({
      providerID: "custom-provider",
      name: "Custom Provider",
      baseURL: "https://example.com/v1",
      modelID: "custom-model",
      modelName: "Custom Model",
      connection,
    })

    expect(patch).toEqual({
      provider: {
        "custom-provider": {
          name: "Custom Provider",
          npm,
          env: ["CUSTOM_PROVIDER_API_KEY"],
          options,
          models: {
            "custom-model": {
              name: "Custom Model",
            },
          },
        },
      },
    })
  })
})
