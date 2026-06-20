import path from "path"

export function splitDisplayPath(input: string) {
  const list = input.split(/[\\/]+/)
  return {
    parent: list.slice(0, -1).join(path.sep),
    name: list.at(-1) ?? "",
  }
}
