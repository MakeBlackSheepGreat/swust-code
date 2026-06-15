import { Effect } from "effect"
import { DREAM_TASK } from "@/session/auto-dream"
import { effectCmd, fail } from "../effect-cmd"
import { runAutonomyTask } from "./autonomy-task"

export const DreamCommand = effectCmd({
  command: "dream",
  describe: "run memory consolidation (dream) for the current project",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("dry-run", {
        type: "boolean",
        describe: "show the dream task without starting an agent",
        default: false,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "start without confirmation",
        default: false,
      })
      .option("model", {
        alias: "m",
        type: "string",
        describe: "model to use in the format of provider/model",
      })
      .option("agent", {
        type: "string",
        describe: "primary agent to use",
      })
      .option("dir", {
        type: "string",
        describe: "project directory to run in",
      }),
  handler: Effect.fn("Cli.dream")(function* (args) {
    const code = yield* runAutonomyTask({
      intro: "Dream: Memory Consolidation",
      title: "Auto Dream",
      goal: "Consolidate verified durable project knowledge into SWUST Code memory and report what changed.",
      task: DREAM_TASK,
      dryRun: args.dryRun,
      yes: args.yes,
      model: args.model,
      agent: args.agent,
      dir: args.dir,
    })
    if (code !== 0) return yield* fail(`Dream run exited with code ${code}`)
  }),
})
