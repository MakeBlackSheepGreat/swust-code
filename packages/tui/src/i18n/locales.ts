/**
 * Locale types and constants for SWUST Code i18n system.
 *
 * Supports 17 languages. Each locale maps to an Intl BCP-47 string
 * for proper formatting of dates, numbers, and pluralization.
 *
 * Ported from MiMo-Code's i18n/locales.ts.
 */

export type Locale =
  | "en"    // English
  | "zh"    // Simplified Chinese
  | "zht"   // Traditional Chinese
  | "ja"    // Japanese
  | "ko"    // Korean
  | "de"    // German
  | "es"    // Spanish
  | "fr"    // French
  | "ru"    // Russian
  | "pt"    // Portuguese (Brazil)
  | "ar"    // Arabic
  | "da"    // Danish
  | "pl"    // Polish
  | "no"    // Norwegian
  | "th"    // Thai
  | "tr"    // Turkish
  | "bs"    // Bosnian

export const LOCALES: readonly Locale[] = [
  "en", "zh", "zht", "ja", "ko", "de", "es", "fr",
  "ru", "pt", "ar", "da", "pl", "no", "th", "tr", "bs",
]

/** Map internal locale codes to Intl BCP-47 strings */
export const INTL: Record<Locale, string> = {
  en: "en-US",
  zh: "zh-Hans",
  zht: "zh-Hant",
  ja: "ja-JP",
  ko: "ko-KR",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ru: "ru-RU",
  pt: "pt-BR",
  ar: "ar-SA",
  da: "da-DK",
  pl: "pl-PL",
  no: "nb-NO",
  th: "th-TH",
  tr: "tr-TR",
  bs: "bs-BA",
}

/** Human-readable labels for each locale (in that locale's language) */
export const LABELS: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  zht: "繁體中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  ru: "Русский",
  pt: "Português (Brasil)",
  ar: "العربية",
  da: "Dansk",
  pl: "Polski",
  no: "Norsk",
  th: "ไทย",
  tr: "Türkçe",
  bs: "Bosanski",
}

/**
 * Normalize a locale string to a valid Locale.
 * Falls back to "en" if invalid.
 */
export function normalizeLocale(input: string): Locale {
  const lower = input.toLowerCase().trim()
  if (LOCALES.includes(lower as Locale)) return lower as Locale
  // Try partial match (e.g., "zh-CN" -> "zh")
  const prefix = lower.split("-")[0]
  if (LOCALES.includes(prefix as Locale)) return prefix as Locale
  return "en"
}
