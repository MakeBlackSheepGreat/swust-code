#!/usr/bin/env bun
import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import pkg from "../package.json"
import { Script } from "@swust-code/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

function listTarballs(dir: string) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => entry.name)
    .sort()
}

async function publish(dir: string, name: string, version: string) {
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  for (const filepath of listTarballs(dir)) {
    fs.rmSync(path.join(dir, filepath), { force: true })
  }
  await $`bun pm pack`.cwd(dir)
  const tarball = listTarballs(dir)[0]
  if (!tarball) throw new Error(`No tarball generated for ${name}@${version} in ${dir}`)
  await $`npm publish ${tarball} --access public --tag ${Script.channel}`.cwd(dir)
}

const binaries: { dir: string; name: string; version: string }[] = []
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const normalized = filepath.replaceAll("\\", "/")
  const p = await Bun.file(`./dist/${normalized}`).json()
  binaries.push({
    dir: path.join("./dist", path.dirname(normalized)),
    name: p.name,
    version: p.version,
  })
}
console.log("binaries", Object.fromEntries(binaries.map((b) => [b.name, b.version])))
const version = binaries[0].version

fs.rmSync(`./dist/${pkg.name}`, { recursive: true, force: true })
fs.mkdirSync(`./dist/${pkg.name}`, { recursive: true })
fs.cpSync("./bin", `./dist/${pkg.name}/bin`, { recursive: true })
fs.copyFileSync("./script/postinstall.mjs", `./dist/${pkg.name}/postinstall.mjs`)
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`./dist/${pkg.name}/README.md`).write(await Bun.file("../../README_npm.md").text())

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      version: version,
      description: "Terminal-native AI coding agent with persistent memory, checkpoints, and MiMo-based multi-agent workflows.",
      license: "MIT",
      author: "SWUST Code Contributors",
      homepage: "https://swust-code.dev",
      repository: {
        type: "git",
        url: "git+https://github.com/MakeBlackSheepGreat/swust-code.git",
      },
      bugs: {
        url: "https://github.com/MakeBlackSheepGreat/swust-code/issues",
      },
      keywords: ["ai", "cli", "coding-agent", "swust-code", "mimo", "terminal", "multi-agent"],
      bin: {
        "swust-code": "./bin/swust-code",
      },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      optionalDependencies: Object.fromEntries(binaries.map((b) => [b.name, b.version])),
    },
    null,
    2,
  ),
)

for (const b of binaries) {
  await publish(b.dir, b.name, b.version)
}
await publish(`./dist/${pkg.name}`, pkg.name, version)
