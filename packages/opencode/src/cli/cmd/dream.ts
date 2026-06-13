import { effectCmd } from "../effect-cmd"
import { Effect } from "effect"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"

export const DreamCommand = effectCmd({
  command: "dream",
  describe: "run memory consolidation (dream) for the current project",
  builder: (yargs) =>
    yargs.option("dry-run", {
      type: "boolean",
      describe: "show what would be consolidated without making changes",
      default: false,
    }),
  handler: Effect.fn("Cli.dream")(function* () {
    UI.empty()
    prompts.intro("Dream: Memory Consolidation")

    prompts.log.info("Dream consolidates durable project memory from:")
    prompts.log.info("  1. Memory files under the data directory")
    prompts.log.info("  2. Raw trajectory in the SQLite database")
    prompts.log.info("")
    prompts.log.info("This will create/update MEMORY.md with verified project knowledge.")

    const shouldRun = yield* Effect.promise(() =>
      prompts.confirm({
        message: "Start memory consolidation?",
        initialValue: true,
      }),
    )

    if (prompts.isCancel(shouldRun) || !shouldRun) {
      prompts.outro("Cancelled")
      return
    }

    prompts.log.info("")
    prompts.log.info("Dream agent will now review the last 7 days of sessions,")
    prompts.log.info("verify facts against the trajectory database, and")
    prompts.log.info("consolidate durable knowledge into MEMORY.md.")
    prompts.log.info("")
    prompts.log.info("The agent has access to: read, write, edit, glob, grep, memory, bash")
    prompts.log.info("with read-only access to the SQLite database.")
    prompts.outro("Dream started (agent will run autonomously)")
  }),
})
