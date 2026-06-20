#!/usr/bin/env bun

import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "util"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    version: { type: "string", short: "v" },
    target: { type: "string", short: "t", default: "HEAD" },
    previous: { type: "string", short: "p" },
    help: { type: "boolean", short: "h", default: false },
  },
})

if (values.help) {
  console.log(`
Usage: bun script/release-notes.ts [options]

Options:
  -v, --version <version>   Release version
  -t, --target <ref>        Target ref (default: HEAD)
  -p, --previous <version>  Previous release version
  -h, --help                Show this help message
`)
  process.exit(0)
}

const version = values.version ?? process.env.SWUST_CODE_VERSION ?? "unknown"
const target = values.target ?? "HEAD"
const root = path.resolve(import.meta.dir, "..")
const customNotesPath = path.join(root, "release-notes", `${version}.md`)

if (fs.existsSync(customNotesPath)) {
  process.stdout.write(await Bun.file(customNotesPath).text())
  process.exit(0)
}

const previous =
  values.previous ??
  (await $`git tag --sort=-version:refname`
    .text()
    .then((text) =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((tag) => tag !== `v${version}`),
    )
    .catch(() => undefined))

const raw = previous
  ? await $`bun script/raw-changelog.ts --from ${previous} --to ${target}`.text().catch(() => "")
  : await $`bun script/raw-changelog.ts --to ${target}`.text().catch(() => "")

const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter(Boolean)

const detailStart = lines.findIndex((line) => line.startsWith("## "))
const detailLines = detailStart >= 0 ? lines.slice(detailStart) : []

const gitSubjects = previous
  ? await $`git log ${previous}..${target} --format=%s`
      .text()
      .then((text) =>
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !line.match(/^(test:|chore:|release:)/i))
          .slice(0, 6)
          .map((line) => line.replace(/^[a-z]+(?:\([^)]+\))?:\s*/i, "")),
      )
      .catch(() => [])
  : []

const bullets = detailLines.filter((line) => line.startsWith("- ")).slice(0, 4)
const fallbackHighlights = [
  ...gitSubjects,
  "主线发布已完成，包含本版本对应的代码、安装包与 Release 资产。",
  "npm 与 GitHub Release 自动发布链路已接入当前仓库主线。",
]
const highlights = bullets.length > 0 ? bullets : fallbackHighlights.map((line) => `- ${line}`)

const output = [
  `# SWUST Code v${version}`,
  "",
  `龙山灵码 ${version} 是当前主线的正式发布版本。`,
  previous
    ? `本次发布基于 ${previous} 之后的主线变更生成，重点延续 MiMo-Code 基座能力并叠加 SWUST-Code 的品牌与功能增强。`
    : "本次发布基于当前主线变更生成，重点延续 MiMo-Code 基座能力并叠加 SWUST-Code 的品牌与功能增强。",
  "",
  "## Highlights",
  "",
  ...highlights,
  "",
]

if (detailLines.length > 0 && !raw.includes("No notable changes.")) {
  output.push("## Detailed Changes", "")
  output.push(...detailLines, "")
}

output.push("## Install", "")
output.push("```bash")
output.push("npm install -g @swust-code/cli")
output.push("swust-code")
output.push("```", "")
output.push("## Links", "")
output.push("- Repository: https://github.com/MakeBlackSheepGreat/swust-code")
output.push("- Documentation: https://swust-code.dev")
output.push("- npm: https://www.npmjs.com/package/@swust-code/cli")

process.stdout.write(output.join("\n").trim() + "\n")
