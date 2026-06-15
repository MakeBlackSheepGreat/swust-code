import { onCleanup } from "solid-js"
import { logos, type LogoKey } from "../logo"
import { useKV } from "../context/kv"
import { useLanguage } from "../context/language"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

export function DialogLogoDesign() {
  const dialog = useDialog()
  const kv = useKV()
  const { t } = useLanguage()
  const initial = kv.get("logo_design")
  let confirmed = false

  onCleanup(() => {
    if (!confirmed) kv.set("logo_design", initial)
  })

  const options: DialogSelectOption<LogoKey>[] = (Object.keys(logos) as LogoKey[]).map((key) => ({
    title: t(`tui.dialog.logo.option.${key}`),
    value: key,
  }))

  return (
    <DialogSelect
      title={t("tui.dialog.logo.title")}
      options={options}
      current={typeof initial === "string" && initial in logos ? (initial as LogoKey) : "thin"}
      onMove={(opt) => kv.set("logo_design", opt.value)}
      onSelect={(opt) => {
        kv.set("logo_design", opt.value)
        confirmed = true
        dialog.clear()
      }}
    />
  )
}
