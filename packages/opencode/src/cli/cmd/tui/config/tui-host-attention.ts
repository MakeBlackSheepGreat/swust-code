import path from "path"
import { fileURLToPath } from "url"
import { Filesystem } from "@/util"

const ATTENTION_SOUND_NAMES = new Set(["default", "question", "permission", "error", "done", "subagent_done"])

export type AttentionSoundPaths = Partial<Record<string, string>>

function resolveFilePath(root: string, file: string) {
  const value = file.startsWith("file://") ? fileURLToPath(file) : file
  const absolute = path.isAbsolute(value) ? value : path.join(root, value)
  return Filesystem.resolve(absolute)
}

export function resolveHostAttentionSoundPaths(
  root: string,
  sounds: unknown,
  options?: { trim?: boolean },
): AttentionSoundPaths {
  if (!sounds || typeof sounds !== "object" || Array.isArray(sounds)) return {}
  return Object.fromEntries(
    Object.entries(sounds).flatMap(([name, file]) => {
      if (!ATTENTION_SOUND_NAMES.has(name)) return []
      if (typeof file !== "string") return []
      const value = options?.trim ? file.trim() : file
      if (!value) return []
      return [[name, resolveFilePath(root, value)]]
    }),
  )
}
