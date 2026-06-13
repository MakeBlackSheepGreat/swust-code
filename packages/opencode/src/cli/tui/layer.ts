import { run as runTui, type TuiInput } from "@swust-code/tui"
import { Global } from "@swust-code/core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
