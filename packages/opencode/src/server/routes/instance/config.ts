import { Hono } from "hono"
import { Effect } from "effect"
import { describeRoute, resolver } from "hono-openapi"
import { Config } from "@/config"
import { Provider } from "@/provider"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"

const CLEARABLE_AGENT_FIELDS = new Set(["model", "variant", "steps"])

function parseUpdateBody(body: unknown) {
  const unset: Config.Unset = {}
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const parsed = Config.Info.safeParse(body)
    return parsed.success ? { success: true as const, config: parsed.data, unset } : { success: false as const, parsed }
  }

  const normalized = structuredClone(body) as Record<string, unknown>
  const agents = normalized.agent
  if (agents && typeof agents === "object" && !Array.isArray(agents)) {
    for (const [name, agent] of Object.entries(agents)) {
      if (!agent || typeof agent !== "object" || Array.isArray(agent)) continue
      for (const [field, value] of Object.entries(agent)) {
        if (value !== null || !CLEARABLE_AGENT_FIELDS.has(field)) continue
        ;(unset.agent ??= {})[name] ??= []
        unset.agent[name].push(field as "model" | "variant" | "steps")
        delete (agent as Record<string, unknown>)[field]
      }
    }
  }

  const parsed = Config.Info.safeParse(normalized)
  return parsed.success ? { success: true as const, config: parsed.data, unset } : { success: false as const, parsed }
}

export const ConfigRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get configuration",
        description: "Retrieve the current OpenCode configuration settings and preferences.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Get config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.get", c, function* () {
          const cfg = yield* Config.Service
          return yield* cfg.get()
        }),
    )
    .patch(
      "/",
      describeRoute({
        summary: "Update configuration",
        description: "Update OpenCode configuration settings and preferences.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Successfully updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const body = await c.req.json()
        const result = parseUpdateBody(body)
        if (!result.success) {
          return c.json({ success: false, data: body, errors: result.parsed.error.issues }, 400)
        }
        return jsonRequest("ConfigRoutes.update", c, function* () {
          const { config, unset } = result
          const cfg = yield* Config.Service
          yield* cfg.update(config, unset)
          return config
        })
      },
    )
    .get(
      "/providers",
      describeRoute({
        summary: "List config providers",
        description: "Get a list of all configured AI providers and their default models.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(Provider.ConfigProvidersResult.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.providers", c, function* () {
          const svc = yield* Provider.Service
          const providers = yield* svc.list()
          return {
            providers: Object.values(providers),
            default: Provider.defaultModelIDs(providers),
          }
        }),
    ),
)
