/**
 * CLI i18n - simple synchronous translation for CLI command output.
 *
 * This module provides a t() function for non-TUI CLI commands.
 * It uses the same dictionaries as the TUI but with a simpler
 * synchronous lookup (no lazy loading).
 *
 * Ported from MiMo-Code's cli/i18n.ts.
 */

import en, { type Keys } from "../../../../tui/src/i18n/en"
import zh from "../../../../tui/src/i18n/zh"
import { detectSystemLocale } from "../../../../tui/src/i18n/system-locale"
import type { Locale } from "../../../../tui/src/i18n/locales"

// Static dictionary map (only languages with full translations)
const DICTS: Record<string, Record<string, string>> = {
  en,
  zh,
}

// Detect locale at module load time
const CURRENT_LOCALE: Locale = detectSystemLocale()
const CURRENT_DICT = DICTS[CURRENT_LOCALE] ?? en

/**
 * Translate a key to the current locale.
 * Falls back to English if key is missing.
 * Supports {param} interpolation (single brace).
 */
export function t(key: Keys, values?: Record<string, string>): string {
  const template = CURRENT_DICT[key] ?? en[key] ?? key
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`)
}

/**
 * Get the current CLI locale.
 */
export function getCliLocale(): Locale {
  return CURRENT_LOCALE
}
