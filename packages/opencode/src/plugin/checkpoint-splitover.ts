import type { Hooks, PluginInput } from "@swust-code/plugin"
import type { ID as ProjectID } from "@swust-code/core/project"
import type { SessionID } from "@/session/schema"
import { buildExtractionReflection, buildReflectionMessage, runValidatorsForCkpt } from "@/session/checkpoint-retry"
import { checkpointPath, memoryPath } from "@/session/checkpoint-paths"
import * as CheckpointContext from "@/session/checkpoint-context"

const EMPTY_CTX: CheckpointContext.CheckpointContext = {
  priorTitles: new Set<string>(),
  expectedRevisions: [],
}

export async function CheckpointSplitoverPlugin(pluginInput: PluginInput): Promise<Hooks> {
  const projectID = pluginInput.project.id as ProjectID

  return {
    "actor.preStop": {
      matcher: { agentType: { include: ["checkpoint-writer"] } },
      run: async (input, output) => {
        const sessionID = (input.parentSessionID ?? input.sessionID) as SessionID
        const ctx = CheckpointContext.get(sessionID, input.actorID) ?? EMPTY_CTX
        try {
          const violations = await runValidatorsForCkpt(sessionID, {
            priorTitles: ctx.priorTitles,
            expectedRevisions: ctx.expectedRevisions,
            projectID,
          })
          if (violations.length === 0) return

          const extractRequired = violations.filter((violation) => violation.severity === "extract-required")
          if (extractRequired.length > 0) {
            output.continue = true
            output.reason = buildExtractionReflection(extractRequired)
            return
          }

          const errors = violations.filter((violation) => violation.severity === "error")
          if (errors.length > 0) {
            output.continue = true
            output.reason = buildReflectionMessage(errors, {
              checkpoint: checkpointPath(sessionID),
              memory: memoryPath(projectID),
            })
          }
        } catch {
          // Hook failures must not trap the checkpoint-writer actor in shutdown.
        }
      },
    },
  }
}
