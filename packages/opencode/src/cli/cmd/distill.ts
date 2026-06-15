import { Effect } from "effect"
import { DISTILL_TASK } from "@/session/auto-dream"
import { effectCmd, fail } from "../effect-cmd"
import { runAutonomyTask } from "./autonomy-task"

export const DistillCommand = effectCmd({
  command: "distill",
  describe: "run workflow packaging (distill) for the current project",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("dry-run", {
        type: "boolean",
        describe: "show the distill task without starting an agent",
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
  handler: Effect.fn("Cli.distill")(function* (args) {
    const code = yield* runAutonomyTask({
      intro: "Distill: Workflow Packaging",
      title: "Auto Distill",
      goal: "Identify repeated workflow patterns and create only high-confidence missing SWUST Code skills, agents, or commands.",
      task: DISTILL_TASK,
      dryRun: args.dryRun,
      yes: args.yes,
      model: args.model,
      agent: args.agent,
      dir: args.dir,
    })
    if (code !== 0) return yield* fail(`Distill run exited with code ${code}`)
  }),
})
