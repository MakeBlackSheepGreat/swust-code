/**
 * Language Context - SolidJS reactive i18n provider for the TUI.
 *
 * Provides:
 * - Reactive locale state (persisted to config)
 * - Translation function t() with {{param}} interpolation
 * - Language switching API
 * - Lazy dictionary loading with cache
 *
 * Ported from MiMo-Code's context/language.tsx.
 */

import { createContext, useContext, createMemo, type Accessor } from "solid-js"
import en, { type Keys, type Dictionary } from "../i18n/en"
import zh from "../i18n/zh"
import { type Locale, LOCALES, LABELS, normalizeLocale } from "../i18n/locales"
import { detectSystemLocale } from "../i18n/system-locale"
import { useKV } from "./kv"

/**
 * Simple template interpolation: replaces {{key}} with values[key].
 */
function resolveTemplate(template: string, values?: Record<string, string | number | boolean>): string {
  if (!values) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? `{{${key}}}`))
}

export interface LanguageContextValue {
  /** Current effective locale */
  readonly locale: Accessor<Locale>
  /** Translation function */
  readonly t: (key: Keys | string, values?: Record<string, string | number | boolean>) => string
  /** Set locale preference (persisted) */
  readonly setLocale: (locale: Locale | "auto") => void
  /** Get locale preference (may be "auto") */
  readonly preference: Accessor<Locale | "auto">
  /** Available locales */
  readonly locales: typeof LOCALES
  /** Labels for each locale */
  readonly labels: typeof LABELS
}

const LanguageContext = createContext<LanguageContextValue>()

export function LanguageProvider(props: { children: any }) {
  const kv = useKV()
  const envPreference = loadEnvPreference()
  const [storedPreference, setStoredPreference] = kv.signal<Locale | "auto">("locale", envPreference ?? "auto")

  const preference = createMemo<Locale | "auto">(() => envPreference ?? storedPreference())
  const locale = createMemo<Locale>(() => {
    const value = preference()
    return value === "auto" ? detectSystemLocale() : normalizeLocale(value)
  })
  const dict = createMemo<Dictionary>(() => (locale() === "zh" || locale() === "zht" ? { ...en, ...zh } : en))

  const t = (key: Keys | string, values?: Record<string, string | number | boolean>): string => {
    const template = dict()[key as Keys] ?? en[key as Keys] ?? key
    return resolveTemplate(template, values)
  }

  const value: LanguageContextValue = {
    locale,
    t,
    setLocale: (next) => setStoredPreference(() => next),
    preference,
    locales: LOCALES,
    labels: LABELS,
  }

  return (
    <LanguageContext.Provider value={value}>
      {props.children}
    </LanguageContext.Provider>
  )
}

/**
 * Access the language context from any component.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    // Fallback for components rendered outside the provider
    return {
      locale: () => "en" as Locale,
      t: (key: Keys | string, values?: Record<string, string | number | boolean>) =>
        resolveTemplate(en[key as Keys] ?? key, values),
      setLocale: () => {},
      preference: () => "auto" as const,
      locales: LOCALES,
      labels: LABELS,
    }
  }
  return ctx
}

function loadEnvPreference(): Locale | "auto" | undefined {
  try {
    const env = process.env.SWUST_CODE_LOCALE
    if (!env) return undefined
    return env === "auto" ? "auto" : normalizeLocale(env)
  } catch {}
  return undefined
}
