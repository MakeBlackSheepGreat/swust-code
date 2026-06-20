import type {
  TuiAttention,
  TuiAttentionNotifyInput,
  TuiAttentionNotifyResult,
  TuiAttentionNotifySkipReason,
  TuiAttentionSoundName,
  TuiAttentionSoundPack,
  TuiAttentionSoundPackInfo,
  TuiAttentionWhen,
  TuiKV,
} from "@swust-code/plugin/tui"
import type { CliRenderer } from "@opentui/core"
import type { TuiConfig } from "./config/tui"
import { resolveAttention } from "./config/tui"
import stripAnsi from "strip-ansi"
import * as Sound from "./util/sound"
import type { useToast } from "./ui/toast"

type FocusState = "unknown" | "focused" | "blurred"

type RegisteredSoundPack = TuiAttentionSoundPack & {
  builtin: boolean
}

type TuiAttentionHost = TuiAttention & {
  dispose(): void
}

const DEFAULT_TITLE = "龙山灵码"
const DEFAULT_PACK_ID = "swust-code.default"
const KV_SOUND_PACK = "attention_sound_pack"
const TITLE_LIMIT = 80
const MESSAGE_LIMIT = 240
const SOUND_NAMES: TuiAttentionSoundName[] = ["default", "question", "permission", "error", "done", "subagent_done"]

const BUILTIN_PACK: RegisteredSoundPack = {
  id: DEFAULT_PACK_ID,
  name: "龙山灵码 Default",
  builtin: true,
  sounds: Sound.Sounds,
}

function skipped(reason: TuiAttentionNotifySkipReason): TuiAttentionNotifyResult {
  return {
    ok: false,
    notification: false,
    sound: false,
    skipped: reason,
  }
}

function normalizeText(input: string | undefined, fallback: string, limit: number) {
  const text = stripAnsi(input ?? "")
    .replace(/[ \t]*[\r\n]+[ \t]*/g, " ")
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim()
  const normalized = text.length ? text : fallback
  return Array.from(normalized).slice(0, limit).join("")
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 0
  return Math.min(1, Math.max(0, volume))
}

function soundVolume(input: TuiAttentionNotifyInput, config: TuiConfig.AttentionInfo) {
  if (!config.sound) return
  if (input.sound === false) return
  if (input.sound === undefined || input.sound === true) return clampVolume(config.volume)
  return clampVolume(input.sound.volume ?? config.volume)
}

function normalizePack(pack: TuiAttentionSoundPack): RegisteredSoundPack | undefined {
  const id = pack.id.trim()
  if (!id) return
  return {
    id,
    name: pack.name?.trim() || undefined,
    builtin: false,
    sounds: Object.fromEntries(
      Object.entries(pack.sounds).filter(
        (item): item is [TuiAttentionSoundName, string] =>
          SOUND_NAMES.includes(item[0] as TuiAttentionSoundName) &&
          typeof item[1] === "string" &&
          item[1].trim().length > 0,
      ),
    ),
  }
}

function focusSkip(when: TuiAttentionWhen, focus: FocusState) {
  if (when === "always") return
  if (focus === "unknown") return "focus_unknown"
  if (when === "blurred" && focus === "focused") return "focused"
  if (when === "focused" && focus === "blurred") return "blurred"
}

export function createTuiAttention(input: {
  renderer: CliRenderer
  config: TuiConfig.Info
  kv?: TuiKV
  toast: ReturnType<typeof useToast>
}): TuiAttentionHost {
  let focus: FocusState = "unknown"
  let disposed = false
  let activePackID: string | undefined
  const config = resolveAttention(input.config)
  const packs = new Map<string, RegisteredSoundPack>([[BUILTIN_PACK.id, BUILTIN_PACK]])

  const onFocus = () => {
    focus = "focused"
  }
  const onBlur = () => {
    focus = "blurred"
  }

  input.renderer.on("focus", onFocus)
  input.renderer.on("blur", onBlur)

  function configuredPackID() {
    const stored = input.kv?.get<string | undefined>(KV_SOUND_PACK, undefined)
    return activePackID ?? stored ?? config.sound_pack
  }

  function currentPack() {
    return packs.get(configuredPackID()) ?? BUILTIN_PACK
  }

  function soundCandidates(name: TuiAttentionSoundName) {
    return [config.sounds[name], currentPack().sounds[name], BUILTIN_PACK.sounds[name]].filter(
      (item, index, list): item is string => typeof item === "string" && list.indexOf(item) === index,
    )
  }

  function playSound(name: TuiAttentionSoundName, volume: number) {
    try {
      const file = soundCandidates(name)[0]
      if (!file) return false
      Sound.playFile(file, volume)
      return true
    } catch (error) {
      console.debug("failed to play attention sound", { error })
      return false
    }
  }

  return {
    async notify(request) {
      try {
        if (!config.enabled) return skipped("attention_disabled")
        if (disposed || input.renderer.isDestroyed) return skipped("renderer_destroyed")

        const message = normalizeText(request.message, "", MESSAGE_LIMIT)
        if (!message) return skipped("empty_message")

        const requestedNotification = typeof request.notification === "object" ? request.notification : undefined
        const notificationSkip = focusSkip(requestedNotification?.when ?? "blurred", focus)
        const notificationRequested = config.notifications && request.notification !== false
        const shouldNotify = notificationRequested && !notificationSkip
        if (shouldNotify) {
          input.toast.show({
            title: normalizeText(request.title, DEFAULT_TITLE, TITLE_LIMIT),
            message,
            variant: "info",
            duration: 5000,
          })
        }

        const volume = soundVolume(request, config)
        const requestedSound = typeof request.sound === "object" ? request.sound : undefined
        const soundSkip = volume === undefined ? undefined : focusSkip(requestedSound?.when ?? "always", focus)
        const soundName =
          requestedSound?.name && SOUND_NAMES.includes(requestedSound.name) ? requestedSound.name : "default"
        const sound = volume === undefined || soundSkip ? false : playSound(soundName, volume)

        if (!shouldNotify && !sound) {
          if (notificationRequested && notificationSkip) return skipped(notificationSkip)
          if (soundSkip) return skipped(soundSkip)
        }

        return {
          ok: shouldNotify || sound,
          notification: shouldNotify,
          sound,
        }
      } catch (error) {
        console.debug("failed to handle attention notification", { error })
        return {
          ok: false,
          notification: false,
          sound: false,
        }
      }
    },
    soundboard: {
      registerPack(pack) {
        const next = normalizePack(pack)
        if (!next) return () => {}
        packs.set(next.id, next)
        let disposed = false
        return () => {
          if (disposed) return
          disposed = true
          if (packs.get(next.id) === next) packs.delete(next.id)
        }
      },
      activate(id, options) {
        const pack = packs.get(id)
        if (!pack) return false
        activePackID = pack.id
        if (options?.persist) input.kv?.set(KV_SOUND_PACK, pack.id)
        return true
      },
      current() {
        return currentPack().id
      },
      list(): TuiAttentionSoundPackInfo[] {
        const current = currentPack().id
        return Array.from(packs.values()).map((pack) => ({
          id: pack.id,
          name: pack.name,
          active: pack.id === current,
          builtin: pack.builtin,
        }))
      },
    },
    dispose() {
      if (disposed) return
      disposed = true
      input.renderer.off("focus", onFocus)
      input.renderer.off("blur", onBlur)
    },
  }
}
