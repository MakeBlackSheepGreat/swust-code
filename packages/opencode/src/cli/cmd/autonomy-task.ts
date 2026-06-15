import { basename } from "path"
import { Effect } from "effect"
import * as prompts from "@clack/prompts"
import { Process } from "@/util/process"
import { UI } from "../ui"

export type AutonomyTaskInput = {
  readonly intro: string
  readonly title: string
  readonly goal: string
  readonly task: string
  readonly dryRun?: boolean
  readonly yes?: boolean
  readonly model?: string
  readonly agent?: string
  readonly dir?: string
}

function currentCli(args: string[]) {
  const name = basename(process.execPath).replace(/\.exe$/i, "").toLowerCase()
  if (name === "bun" && process.argv[1]) return [process.execPath, ...process.execArgv, process.argv[1], ...args]
  return [process.execPath, ...args]
}

export function runAutonomyTask(input: AutonomyTaskInput) {
  return Effect.gen(function* () {
    UI.empty()
    prompts.intro(input.intro)
    prompts.log.info(input.task)

    if (input.dryRun) {
      prompts.outro("Dry run complete")
      return 0
    }

    const confirmed = input.yes
      ? true
      : yield* Effect.promise(() =>
          prompts.confirm({
            message: "Start autonomous run?",
            initialValue: true,
          }),
        )

    if (prompts.isCancel(confirmed) || !confirmed) {
      prompts.outro("Cancelled")
      return 0
    }

    const args = [
      "run",
      "--title",
      input.title,
      "--goal",
      input.goal,
      ...(input.model ? ["--model", input.model] : []),
      ...(input.agent ? ["--agent", input.agent] : []),
      ...(input.dir ? ["--dir", input.dir] : []),
      input.task,
    ]

    prompts.log.info(`Starting ${input.title}...`)

    const code = yield* Effect.promise(
      () =>
        Process.spawn(currentCli(args), {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          cwd: process.cwd(),
        }).exited,
    )

    if (code === 0) prompts.outro(`${input.title} complete`)
    return code
  })
}
