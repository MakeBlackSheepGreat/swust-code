import fs from "fs/promises"
import path from "path"

export async function supportsSymlink(dir: string, type: "file" | "dir" | "junction" = "file") {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const target = path.join(dir, `.symlink-target-${suffix}${type === "file" ? ".txt" : ""}`)
  const link = path.join(dir, `.symlink-link-${suffix}`)

  try {
    if (type === "file") await fs.writeFile(target, "x", "utf8")
    else await fs.mkdir(target)

    await fs.symlink(target, link, type)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "EPERM" || code === "EACCES") return false
    throw error
  } finally {
    await fs.rm(link, { force: true, recursive: true }).catch(() => undefined)
    await fs.rm(target, { force: true, recursive: true }).catch(() => undefined)
  }
}
