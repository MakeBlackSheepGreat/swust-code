import z from "zod"
import { ConfigPlugin } from "@/config/plugin"
import { ConfigKeybinds } from "@/config/keybinds"

const AttentionSoundName = z.enum(["default", "question", "permission", "error", "done", "subagent_done"])

const Attention = z
  .object({
    enabled: z.boolean().optional().describe("Enable attention notifications and sounds"),
    notifications: z.boolean().optional().describe("Show TUI attention notifications"),
    sound: z.boolean().optional().describe("Play attention sounds"),
    volume: z.number().min(0).max(1).optional().describe("Attention sound volume from 0 to 1"),
    sound_pack: z.string().optional().describe("Active attention sound pack ID"),
    sounds: z
      .partialRecord(AttentionSoundName, z.string())
      .optional()
      .describe("Custom sound paths by event name"),
  })
  .strict()
  .describe("Attention notification and sound settings")

const KeybindOverride = z
  .object(
    Object.fromEntries(Object.keys(ConfigKeybinds.Keybinds.shape).map((key) => [key, z.string().optional()])) as Record<
      string,
      z.ZodOptional<z.ZodString>
    >,
  )
  .strict()

export const TuiOptions = z.object({
  scroll_speed: z.number().min(0.001).optional().describe("TUI scroll speed"),
  scroll_acceleration: z
    .object({
      enabled: z.boolean().describe("Enable scroll acceleration"),
    })
    .optional()
    .describe("Scroll acceleration settings"),
  diff_style: z
    .enum(["auto", "stacked"])
    .optional()
    .describe("Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column"),
  mouse: z.boolean().optional().describe("Enable or disable mouse capture (default: true)"),
})

export const TuiInfo = z
  .object({
    $schema: z.string().optional(),
    theme: z.string().optional(),
    keybinds: KeybindOverride.optional(),
    plugin: ConfigPlugin.Spec.zod.array().optional(),
    plugin_enabled: z.record(z.string(), z.boolean()).optional(),
    attention: Attention.optional(),
  })
  .extend(TuiOptions.shape)
  .strict()
