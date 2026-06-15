import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@swust-code/core/agent"
import { FSUtil } from "@swust-code/core/fs-util"
import { SkillPlugin } from "@swust-code/core/plugin/skill"
import { SkillV2 } from "@swust-code/core/skill"
import { SkillDiscovery } from "@swust-code/core/skill/discovery"
import { testEffect } from "../lib/effect"

const it = testEffect(
  SkillV2.layer.pipe(
    Layer.provide(FSUtil.defaultLayer),
    Layer.provide(SkillDiscovery.defaultLayer),
    Layer.provideMerge(AgentV2.locationLayer),
  ),
)

describe("SkillPlugin.Plugin", () => {
  it.effect("registers the built-in customize and compose skills", () =>
    Effect.gen(function* () {
      const skill = yield* SkillV2.Service
      yield* SkillPlugin.Plugin.effect.pipe(Effect.provideService(SkillV2.Service, skill))

      expect(yield* skill.list()).toContainEqual(
        expect.objectContaining({
          name: "customize-swust-code",
          description: expect.stringContaining("SWUST Code's own configuration"),
        }),
      )

      const names = (yield* skill.list()).map((item) => item.name)
      expect(names).toContain("compose:brainstorm")
      expect(names).toContain("compose:verify")

      const visible = SkillV2.available(
        yield* skill.list(),
        new AgentV2.Info({
          ...AgentV2.Info.empty(AgentV2.ID.make("build")),
          permissions: [{ action: "*", resource: "*", effect: "allow" }],
        }),
      ).map((item) => item.name)
      expect(visible).not.toContain("compose:brainstorm")
      expect(visible).not.toContain("compose:verify")
    }),
  )
})
