import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { createMemo, createSignal } from "solid-js"
import { Locale } from "../util/locale"
import { useTheme } from "../context/theme"
import { usePromptStash, type StashEntry } from "./prompt/stash"
import { useCommandShortcut } from "../keymap"
import { useLanguage } from "../context/language"

function getRelativeTime(timestamp: number, t: (key: string, values?: Record<string, string | number | boolean>) => string): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return t("tui.dialog.stash.time.just_now")
  if (minutes < 60) return t("tui.dialog.stash.time.minutes", { count: minutes })
  if (hours < 24) return t("tui.dialog.stash.time.hours", { count: hours })
  if (days < 7) return t("tui.dialog.stash.time.days", { count: days })
  return Locale.datetime(timestamp)
}

function getStashPreview(input: string, maxLength: number = 50): string {
  const firstLine = input.split("\n")[0].trim()
  return Locale.truncate(firstLine, maxLength)
}

export function DialogStash(props: { onSelect: (entry: StashEntry) => void }) {
  const dialog = useDialog()
  const stash = usePromptStash()
  const { theme } = useTheme()
  const { t } = useLanguage()

  const [toDelete, setToDelete] = createSignal<number>()
  const deleteHint = useCommandShortcut("stash.delete")

  const options = createMemo(() => {
    const entries = stash.list()
    // Show most recent first
    return entries
      .map((entry, index) => {
        const isDeleting = toDelete() === index
        const lineCount = (entry.input.match(/\n/g)?.length ?? 0) + 1
        return {
          title: isDeleting ? t("tui.dialog.session_list.delete_confirm", { keybind: deleteHint() }) : getStashPreview(entry.input),
          bg: isDeleting ? theme.error : undefined,
          value: index,
          description: getRelativeTime(entry.timestamp, t),
          footer: lineCount > 1 ? t("tui.dialog.stash.lines", { count: lineCount }) : undefined,
        }
      })
      .toReversed()
  })

  return (
    <DialogSelect
      title={t("tui.command.prompt.stash.list.title")}
      options={options()}
      onMove={() => {
        setToDelete(undefined)
      }}
      onSelect={(option) => {
        const entries = stash.list()
        const entry = entries[option.value]
        if (entry) {
          stash.remove(option.value)
          props.onSelect(entry)
        }
        dialog.clear()
      }}
      actions={[
        {
          command: "stash.delete",
          title: t("tui.dialog.session_list.delete"),
          onTrigger: (option) => {
            if (toDelete() === option.value) {
              stash.remove(option.value)
              setToDelete(undefined)
              return
            }
            setToDelete(option.value)
          },
        },
      ]}
    />
  )
}
