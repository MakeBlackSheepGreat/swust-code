/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import path from "path"
import { Effect } from "effect"
import { PluginV2 } from "../plugin"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-swust-code.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent
export const ComposeSkillDirectory = AbsolutePath.make(
  path.resolve(import.meta.dir, "../../../opencode/src/skill/compose/.bundle"),
)

export const Plugin = PluginV2.define({
  id: PluginV2.ID.make("skill"),
  effect: Effect.gen(function* () {
    const skill = yield* SkillV2.Service
    const transform = yield* skill.transform()

    yield* transform((editor) => {
      editor.source(
        new SkillV2.EmbeddedSource({
          type: "embedded",
          skill: new SkillV2.Info({
            name: "customize-swust-code",
            description:
              "Use ONLY when the user is editing or creating SWUST Code's own configuration: swust-code.json, swust-code.jsonc, files under .swust-code/, or files under ~/.config/swust-code/. Also use when creating or fixing SWUST Code agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring SWUST Code itself.",
            location: AbsolutePath.make("/builtin/customize-swust-code.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
      editor.source(
        new SkillV2.DirectorySource({
          type: "directory",
          path: ComposeSkillDirectory,
        }),
      )
    })
  }),
})
