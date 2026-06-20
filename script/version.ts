#!/usr/bin/env bun

import { Script } from "@swust-code/script"
import { $ } from "bun"

const output = [`version=${Script.version}`]
const sha = process.env.GITHUB_SHA ?? (await $`git rev-parse HEAD`.text()).trim()

if (!Script.preview) {
  const dir = process.env.RUNNER_TEMP ?? "/tmp"
  const notesFile = `${dir}/opencode-release-notes.txt`
  const repo = process.env.GH_REPO
  const body =
    await $`bun script/release-notes.ts --version ${Script.version} --target ${sha}`
      .cwd(process.cwd())
      .text()
      .catch(() => `# SWUST Code v${Script.version}\n\nRelease notes generation failed.`)
  await Bun.write(notesFile, body)
  if (repo) {
    await $`gh release create v${Script.version} -d --target ${sha} --title "v${Script.version}" --notes-file ${notesFile} --repo ${repo}`.nothrow()
    await $`gh release edit v${Script.version} --title "v${Script.version}" --notes-file ${notesFile} --target ${sha} --repo ${repo}`.nothrow()
  } else {
    await $`gh release create v${Script.version} -d --target ${sha} --title "v${Script.version}" --notes-file ${notesFile}`.nothrow()
    await $`gh release edit v${Script.version} --title "v${Script.version}" --notes-file ${notesFile} --target ${sha}`.nothrow()
  }
  const release = repo
    ? await $`gh release view v${Script.version} --json tagName,databaseId --repo ${repo}`.json()
    : await $`gh release view v${Script.version} --json tagName,databaseId`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
} else if (Script.channel === "beta") {
  await $`gh release create v${Script.version} -d --title "v${Script.version}" --repo ${process.env.GH_REPO}`.nothrow()
  const release =
    await $`gh release view v${Script.version} --json tagName,databaseId --repo ${process.env.GH_REPO}`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
}

output.push(`repo=${process.env.GH_REPO}`)

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}

process.exit(0)
