/**
 * English dictionary - canonical key definitions for SWUST Code i18n.
 *
 * All other locale files import the Keys type from here and use
 * `satisfies Partial<Record<Keys, string>>` for type safety.
 * Missing keys fall back to English at runtime.
 *
 * Key categories:
 * - language.* : language names
 * - tui.prompt.* : prompt input area
 * - tui.tips.* : home page tips
 * - tui.command.* : command palette
 * - tui.dialog.* : dialog strings
 * - tui.toast.* : toast notifications
 * - tui.session.* : session UI
 * - cli.* : CLI command output
 */

const en = {
  // Language names
  "language.en": "English",
  "language.zh": "简体中文",
  "language.zht": "繁體中文",
  "language.ja": "日本語",
  "language.ko": "한국어",
  "language.de": "Deutsch",
  "language.es": "Español",
  "language.fr": "Français",
  "language.ru": "Русский",
  "language.pt": "Português",
  "language.ar": "العربية",
  "language.da": "Dansk",
  "language.pl": "Polski",
  "language.no": "Norsk",
  "language.th": "ไทย",
  "language.tr": "Türkçe",
  "language.bs": "Bosanski",
  "language.auto": "Auto (system)",

  // Prompt area
  "tui.prompt.placeholder": "Type a message or / for commands...",
  "tui.prompt.hint.tab": "Tab to switch agent",
  "tui.prompt.hint.enter": "Enter to send",
  "tui.prompt.hint.shiftEnter": "Shift+Enter for newline",

  // Command palette
  "tui.command.session.new.title": "New Session",
  "tui.command.session.new.description": "Start a fresh conversation",
  "tui.command.session.list.title": "Session List",
  "tui.command.session.list.description": "Browse and resume sessions",
  "tui.command.config.title": "Settings",
  "tui.command.config.description": "Configure SWUST Code",
  "tui.command.help.title": "Help",
  "tui.command.help.description": "Show keyboard shortcuts",
  "tui.command.language.title": "Language",
  "tui.command.language.description": "Change display language",
  "tui.command.memory.title": "Memory",
  "tui.command.memory.description": "Search persistent memory",
  "tui.command.goal.title": "Set Goal",
  "tui.command.goal.description": "Set autonomous goal for this session",
  "tui.command.dream.title": "Dream",
  "tui.command.dream.description": "Consolidate project memory",
  "tui.command.distill.title": "Distill",
  "tui.command.distill.description": "Discover reusable workflows",

  // Dialogs
  "tui.dialog.language.title": "Select Language",
  "tui.dialog.confirm.yes": "Yes",
  "tui.dialog.confirm.no": "No",
  "tui.dialog.confirm.cancel": "Cancel",

  // Toast messages
  "tui.toast.session.created": "New session created",
  "tui.toast.session.deleted": "Session deleted",
  "tui.toast.memory.searching": "Searching memory...",
  "tui.toast.memory.noResults": "No memory results found",
  "tui.toast.goal.set": "Goal set: {{condition}}",
  "tui.toast.goal.cleared": "Goal cleared",

  // Session UI
  "tui.session.badge.running": "Running",
  "tui.session.badge.idle": "Idle",
  "tui.session.badge.error": "Error",
  "tui.session.badge.goal": "Goal: {{condition}}",

  // Tips (shown on home page)
  "tui.tip.1": "Use /memory to search persistent project knowledge",
  "tui.tip.2": "Set a goal with /goal to let the agent work autonomously",
  "tui.tip.3": "Run /dream to consolidate what the agent has learned",
  "tui.tip.4": "Press Tab to switch between build and plan agents",
  "tui.tip.5": "Memory files in .swust-code/memory/ persist across sessions",
  "tui.tip.6": "Use /distill to discover repeated workflows as reusable skills",
  "tui.tip.7": "The agent remembers project context via MEMORY.md",
  "tui.tip.8": "Slash commands: /help /memory /goal /dream /distill /status",

  // CLI output
  "cli.dream.starting": "Starting Dream: memory consolidation...",
  "cli.dream.complete": "Dream complete",
  "cli.distill.starting": "Starting Distill: workflow discovery...",
  "cli.distill.complete": "Distill complete",
  "cli.memory.searching": "Searching memory for: {{query}}",
  "cli.goal.set": "Goal set: {{condition}}",
  "cli.goal.cleared": "Goal cleared",
} as const

export type Keys = keyof typeof en
export type Dictionary = Partial<Record<Keys, string>>
export default en
