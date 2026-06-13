import { effectCmd } from "../effect-cmd"
import { Effect } from "effect"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"

export const DistillCommand = effectCmd({
  command: "distill",
  describe: "run workflow packaging (distill) for the current project",
  builder: (yargs) =>
    yargs.option("dry-run", {
      type: "boolean",
      describe: "show what would be packaged without making changes",
      default: false,
    }),
  handler: Effect.fn("Cli.distill")(function* () {
    UI.empty()
    prompts.intro("Distill: Workflow Packaging")

    prompts.log.info("Distill reviews recent sessions to find repeated workflows:")
    prompts.log.info("  1. Scans trajectory database for repeated tool usage patterns")
    prompts.log.info("  2. Identifies high-confidence candidates (occurred >= 2 times)")
    prompts.log.info("  3. Packages them as skills, agents, or commands")
    prompts.log.info("")
    prompts.log.info("Default window: last 30 days of sessions.")

    const shouldRun = yield* Effect.promise(() =>
      prompts.confirm({
        message: "Start workflow distillation?",
        initialValue: true,
      }),
    )

    if (prompts.isCancel(shouldRun) || !shouldRun) {
      prompts.outro("Cancelled")
      return
    }

    prompts.log.info("Distill agent would be spawned here with the packaging task.")
    prompts.log.info("Full implementation requires subagent orchestration (Phase 2).")
    prompts.outro("Distill complete (stub)")
  }),
}
)
