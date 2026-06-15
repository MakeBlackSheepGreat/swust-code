import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { useBindings, useCommandShortcut } from "../keymap"
import { useLanguage } from "../context/language"

export function DialogHelp() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const { t } = useLanguage()
  const commandShortcut = useCommandShortcut("command.palette.show")

  useBindings(() => ({
    bindings: [
      { key: "return", desc: t("tui.dialog.help.close"), group: t("tui.command.category.dialog"), cmd: () => dialog.clear() },
      { key: "escape", desc: t("tui.dialog.help.close"), group: t("tui.command.category.dialog"), cmd: () => dialog.clear() },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {t("tui.command.help.show.title")}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          {t("tui.dialog.help.close_hint")}
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>{t("tui.dialog.help.command_list", { keybind: commandShortcut() })}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>{t("tui.dialog.help.ok")}</text>
        </box>
      </box>
    </box>
  )
}
