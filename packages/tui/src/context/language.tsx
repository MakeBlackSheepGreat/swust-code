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

import { createContext, useContext, createSignal, createMemo, type Accessor } from "solid-js"
import en, { type Keys, type Dictionary } from "../i18n/en"
import zh from "../i18n/zh"
import { type Locale, LOCALES, LABELS, normalizeLocale } from "../i18n/locales"
import { detectSystemLocale } from "../i18n/system-locale"

// Dictionary cache
const dictCache = new Map<Locale, Dictionary>([["en", en], ["zh", zh]])

/**
 * Load a dictionary for a locale (lazy, cached).
 * English is always available; others load on demand.
 */
async function loadDict(locale: Locale): Promise<Dictionary> {
  if (dictCache.has(locale)) return dictCache.get(locale)!

  try {
    let dict: Dictionary
    switch (locale) {
      case "zh":
        dict = (await import("../i18n/zh")).default
        break
      default:
        dict = {} // Fallback to English
    }
    dictCache.set(locale, dict)
    return dict
  } catch {
    return {}
  }
}

/**
 * Simple template interpolation: replaces {{key}} with values[key].
 */
function resolveTemplate(template: string, values?: Record<string, string>): string {
  if (!values) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`)
}

export interface LanguageContextValue {
  /** Current effective locale */
  readonly locale: Accessor<Locale>
  /** Translation function */
  readonly t: (key: Keys, values?: Record<string, string>) => string
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
  // Load saved preference (default: "auto")
  const [preference, setPreference] = createSignal<Locale | "auto">(
    loadPreference(),
  )

  // Current active dictionary
  const [dict, setDict] = createSignal<Dictionary>(en)

  // Effective locale
  const locale = createMemo<Locale>(() => {
    const pref = preference()
    return pref === "auto" ? detectSystemLocale() : normalizeLocale(pref)
  })

  // Load dictionary when locale changes
  createMemo(() => {
    const l = locale()
    if (l === "en") {
      setDict(en)
    } else {
      loadDict(l).then(setDict)
    }
  })

  // Translation function
  const t = (key: Keys, values?: Record<string, string>): string => {
    const d = dict()
    const template = d[key] ?? en[key] ?? key
    return resolveTemplate(template, values)
  }

  // Set locale preference
  const setLocale = (l: Locale | "auto") => {
    setPreference(l)
    savePreference(l)
  }

  const value: LanguageContextValue = {
    locale,
    t,
    setLocale,
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
      t: (key: Keys) => en[key] ?? key,
      setLocale: () => {},
      preference: () => "auto" as const,
      locales: LOCALES,
      labels: LABELS,
    }
  }
  return ctx
}

// Preference persistence (simple localStorage-style via global state)
let _preference: Locale | "auto" = "auto"

function loadPreference(): Locale | "auto" {
  try {
    // Try to read from environment or config
    const env = process.env.SWUST_CODE_LOCALE
    if (env) return env === "auto" ? "auto" : normalizeLocale(env)
  } catch {}
  return _preference
}

function savePreference(locale: Locale | "auto") {
  _preference = locale
  try {
    process.env.SWUST_CODE_LOCALE = locale
  } catch {}
}
