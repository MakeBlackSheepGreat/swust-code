import { createMemo } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useLanguage } from "../context/language"
import type { Locale } from "../i18n/locales"

type LanguageChoice = Locale | "auto"

export function DialogLanguageList() {
  const language = useLanguage()
  const dialog = useDialog()
  const options = createMemo(() => [
    {
      title: language.t("tui.language.auto"),
      value: "auto" as LanguageChoice,
      description: language.labels[language.locale()],
    },
    ...language.locales.map((locale) => ({
      title: language.labels[locale],
      value: locale as LanguageChoice,
    })),
  ])

  return (
    <DialogSelect<LanguageChoice>
      title={language.t("tui.command.language.dialog.title")}
      placeholder={language.t("tui.dialog.select.placeholder")}
      options={options()}
      current={language.preference()}
      onSelect={(option) => {
        language.setLocale(option.value)
        dialog.clear()
      }}
    />
  )
}
