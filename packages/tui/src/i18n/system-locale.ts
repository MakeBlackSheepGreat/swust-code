/**
 * System Locale Detection - three-layer detection strategy.
 *
 * 1. Timezone-based (primary): matches Intl timezone to locale
 * 2. Environment variable fallback: LC_ALL, LC_MESSAGES, LANG, LANGUAGE
 * 3. Intl fallback: Intl.DateTimeFormat().resolvedOptions().locale
 *
 * Ported from MiMo-Code's system-locale.ts.
 */

import type { Locale } from "../i18n/locales"
import { normalizeLocale } from "../i18n/locales"

// Timezone → locale mapping
const TIMEZONE_LOCALE_MAP: Record<string, Locale> = {
  // Chinese (Simplified)
  "Asia/Shanghai": "zh",
  "Asia/Chongqing": "zh",
  "Asia/Harbin": "zh",
  "Asia/Urumqi": "zh",
  "Asia/Kashgar": "zh",
  // Chinese (Traditional)
  "Asia/Hong_Kong": "zht",
  "Asia/Macau": "zht",
  "Asia/Taipei": "zht",
  // Japanese
  "Asia/Tokyo": "ja",
  // Korean
  "Asia/Seoul": "ko",
  // Russian
  "Europe/Moscow": "ru",
  "Asia/Yekaterinburg": "ru",
  "Asia/Novosibirsk": "ru",
  "Asia/Krasnoyarsk": "ru",
  "Asia/Irkutsk": "ru",
  "Asia/Yakutsk": "ru",
  "Asia/Vladivostok": "ru",
  "Asia/Kamchatka": "ru",
  // German
  "Europe/Berlin": "de",
  "Europe/Vienna": "de",
  // French
  "Europe/Paris": "fr",
  "America/Montreal": "fr",
  // Spanish
  "Europe/Madrid": "es",
  "America/Mexico_City": "es",
  "America/Bogota": "es",
  "America/Buenos_Aires": "es",
  // Portuguese
  "America/Sao_Paulo": "pt",
  // Arabic
  "Asia/Riyadh": "ar",
  "Africa/Cairo": "ar",
  // Danish
  "Europe/Copenhagen": "da",
  // Polish
  "Europe/Warsaw": "pl",
  // Norwegian
  "Europe/Oslo": "no",
  // Thai
  "Asia/Bangkok": "th",
  // Turkish
  "Europe/Istanbul": "tr",
  // Bosnian
  "Europe/Sarajevo": "bs",
}

// Environment variable locale patterns
const ENV_LOCALE_PATTERNS: Array<{ pattern: RegExp; locale: Locale }> = [
  { pattern: /^zh.*(hant|tw|hk|mo)/i, locale: "zht" },
  { pattern: /^zh/i, locale: "zh" },
  { pattern: /^ja/i, locale: "ja" },
  { pattern: /^ko/i, locale: "ko" },
  { pattern: /^de/i, locale: "de" },
  { pattern: /^es/i, locale: "es" },
  { pattern: /^fr/i, locale: "fr" },
  { pattern: /^ru/i, locale: "ru" },
  { pattern: /^pt/i, locale: "pt" },
  { pattern: /^ar/i, locale: "ar" },
  { pattern: /^da/i, locale: "da" },
  { pattern: /^pl/i, locale: "pl" },
  { pattern: /^no|nb|nn/i, locale: "no" },
  { pattern: /^th/i, locale: "th" },
  { pattern: /^tr/i, locale: "tr" },
  { pattern: /^bs/i, locale: "bs" },
  { pattern: /^en/i, locale: "en" },
]

/**
 * Detect the system locale using three-layer strategy.
 */
export function detectSystemLocale(): Locale {
  // Layer 1: Timezone-based
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && TIMEZONE_LOCALE_MAP[tz]) {
      return TIMEZONE_LOCALE_MAP[tz]
    }
  } catch {
    // Intl not available
  }

  // Layer 2: Environment variables
  const envVars = ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"]
  for (const envVar of envVars) {
    const value = process.env[envVar]
    if (!value) continue

    // Split on ":" for LANGUAGE which can be "en_US:zh_CN"
    const first = value.split(":")[0]
    // Strip encoding and modifiers: "zh_CN.UTF-8@mod" -> "zh_CN"
    const cleaned = first.split(".")[0].split("@")[0]

    for (const { pattern, locale } of ENV_LOCALE_PATTERNS) {
      if (pattern.test(cleaned)) return locale
    }
  }

  // Layer 3: Intl fallback
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale
    if (intlLocale) {
      return normalizeLocale(intlLocale)
    }
  } catch {
    // Intl not available
  }

  return "en"
}
