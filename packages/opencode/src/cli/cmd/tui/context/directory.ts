import { createMemo } from "solid-js"
import { useProject } from "./project"
import { useSync } from "./sync"
import { useTuiPaths } from "./runtime"

export function useDirectory() {
  const project = useProject()
  const sync = useSync()
  const paths = useTuiPaths()
  return createMemo(() => {
    const directory = project.instance.path().directory || paths.cwd
    const result = directory.replace(paths.home, "~")
    if (sync.data.vcs?.branch) return result + ":" + sync.data.vcs.branch
    return result
  })
}
