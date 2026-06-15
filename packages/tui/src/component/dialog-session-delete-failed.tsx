import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useBindings } from "../keymap"
import { useLanguage } from "../context/language"

export function DialogSessionDeleteFailed(props: {
  session: string
  workspace: string
  onDelete?: () => boolean | void | Promise<boolean | void>
  onRestore?: () => boolean | void | Promise<boolean | void>
  onDone?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const { t } = useLanguage()
  const [store, setStore] = createStore({
    active: "delete" as "delete" | "restore",
  })

  const options = [
    {
      id: "delete" as const,
      title: t("tui.dialog.session_delete_failed.delete.title"),
      description: t("tui.dialog.session_delete_failed.delete.description"),
      run: props.onDelete,
    },
    {
      id: "restore" as const,
      title: t("tui.dialog.session_delete_failed.restore.title"),
      description: t("tui.dialog.session_delete_failed.restore.description"),
      run: props.onRestore,
    },
  ]

  async function confirm() {
    const result = await options.find((item) => item.id === store.active)?.run?.()
    if (result === false) return
    props.onDone?.()
    if (!props.onDone) dialog.clear()
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: t("tui.dialog.session_delete_failed.confirm"), group: t("tui.command.category.dialog"), cmd: () => void confirm() },
      { key: "left", desc: t("tui.dialog.session_delete_failed.delete_broken"), group: t("tui.command.category.dialog"), cmd: () => setStore("active", "delete") },
      { key: "up", desc: t("tui.dialog.session_delete_failed.delete_broken"), group: t("tui.command.category.dialog"), cmd: () => setStore("active", "delete") },
      { key: "right", desc: t("tui.dialog.session_delete_failed.restore_broken"), group: t("tui.command.category.dialog"), cmd: () => setStore("active", "restore") },
      { key: "down", desc: t("tui.dialog.session_delete_failed.restore_broken"), group: t("tui.command.category.dialog"), cmd: () => setStore("active", "restore") },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {t("tui.dialog.session_delete_failed.title")}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        {t("tui.dialog.session_delete_failed.message", { session: props.session, workspace: props.workspace })}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        {t("tui.dialog.session_delete_failed.recover")}
      </text>
      <box flexDirection="column" paddingBottom={1} gap={1}>
        <For each={options}>
          {(item) => (
            <box
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={item.id === store.active ? theme.primary : undefined}
              onMouseUp={() => {
                setStore("active", item.id)
                void confirm()
              }}
            >
              <text
                attributes={TextAttributes.BOLD}
                fg={item.id === store.active ? theme.selectedListItemText : theme.text}
              >
                {item.title}
              </text>
              <text fg={item.id === store.active ? theme.selectedListItemText : theme.textMuted} wrapMode="word">
                {item.description}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
