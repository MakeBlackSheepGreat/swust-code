import path from "path"
import { pathToFileURL } from "url"
import { Effect } from "effect"
import matter from "gray-matter"
import { FSUtil } from "@swust-code/core/fs-util"
import { Path as GlobalPath } from "@swust-code/core/global"
import { InstallationLocal, InstallationVersion } from "@swust-code/core/installation/version"
import { loadComposeBundle } from "./bundle.macro" with { type: "macro" }
import { loadComposeBundle as loadComposeBundleDev } from "./bundle.macro"
import { fallbackSanitization } from "@/config/markdown"

function safeLoadComposeBundle() {
  try {
    return loadComposeBundle()
  } catch (error) {
    if (error instanceof ReferenceError) {
      return loadComposeBundleDev()
    }
    throw error
  }
}

const COMPOSE_BUNDLE = safeLoadComposeBundle()

export const extractComposeBundle = Effect.fn("Skill.extractComposeBundle")(function* (
  fsys: FSUtil.Interface,
) {
  const root = path.join(GlobalPath.data, "compose", InstallationVersion)
  const marker = path.join(root, ".extracted")

  if (!InstallationLocal && (yield* fsys.existsSafe(marker))) return root

  for (const [skillName, files] of Object.entries(COMPOSE_BUNDLE)) {
    const skillDir = path.join(root, "skills", skillName)
    for (const [relPath, content] of Object.entries(files)) {
      yield* fsys.writeWithDirs(path.join(skillDir, relPath), content)
    }
  }
  yield* fsys.writeWithDirs(marker, InstallationVersion)
  yield* Effect.logInfo("extracted compose skills", { root })
  return root
})

function parseSkillMeta(content: string) {
  try {
    return matter(content)
  } catch {
    try {
      return matter(fallbackSanitization(content))
    } catch {
      return undefined
    }
  }
}

export function composeSkillsBlock(): string {
  const root = path.join(GlobalPath.data, "compose", InstallationVersion)
  const entries: string[] = []

  for (const [skillName, files] of Object.entries(COMPOSE_BUNDLE)) {
    const skillMd = files["SKILL.md"]
    if (!skillMd) continue
    const parsed = parseSkillMeta(skillMd)
    if (!parsed?.data?.name || !parsed?.data?.description) continue

    const location = pathToFileURL(path.join(root, "skills", skillName, "SKILL.md")).href
    entries.push(
      `  <skill>`,
      `    <name>${parsed.data.name}</name>`,
      `    <description>${parsed.data.description}</description>`,
      `    <location>${location}</location>`,
      `  </skill>`,
    )
  }

  if (entries.length === 0) return ""
  return ["<compose_skills>", ...entries, "</compose_skills>"].join("\n")
}
