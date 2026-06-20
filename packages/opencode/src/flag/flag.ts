import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const SWUST_CODE_EXPERIMENTAL = truthy("SWUST_CODE_EXPERIMENTAL")

// Defaults to false. When enabled, swust-code runs in pure-mimo mode:
//   — does NOT inherit Claude Code's settings (CLAUDE.md, ~/.claude/skills, etc.)
//   — does NOT pick up provider API keys from environment variables
//   — falls back to the mimo-auto model as the default
// Set SWUST_CODE_MIMO_ONLY=true to disable .claude inheritance and env-based
// provider auto-detection.
const SWUST_CODE_MIMO_ONLY = truthy("SWUST_CODE_MIMO_ONLY")
const SWUST_CODE_DISABLE_CLAUDE_CODE_ENV = truthy("SWUST_CODE_DISABLE_CLAUDE_CODE")
const SWUST_CODE_DISABLE_CLAUDE_CODE = SWUST_CODE_MIMO_ONLY || SWUST_CODE_DISABLE_CLAUDE_CODE_ENV

const SWUST_CODE_DISABLE_EXTERNAL_SKILLS = truthy("SWUST_CODE_DISABLE_EXTERNAL_SKILLS")
const SWUST_CODE_DISABLE_CLAUDE_CODE_SKILLS =
  SWUST_CODE_DISABLE_EXTERNAL_SKILLS || SWUST_CODE_DISABLE_CLAUDE_CODE || truthy("SWUST_CODE_DISABLE_CLAUDE_CODE_SKILLS")
const copy = process.env["SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SWUST_CODE_AUTO_SHARE: truthy("SWUST_CODE_AUTO_SHARE"),
  SWUST_CODE_AUTO_HEAP_SNAPSHOT: truthy("SWUST_CODE_AUTO_HEAP_SNAPSHOT"),
  SWUST_CODE_GIT_BASH_PATH: process.env["SWUST_CODE_GIT_BASH_PATH"],
  SWUST_CODE_CONFIG: process.env["SWUST_CODE_CONFIG"],
  SWUST_CODE_CONFIG_CONTENT: process.env["SWUST_CODE_CONFIG_CONTENT"],

  SWUST_CODE_DISABLE_AUTOUPDATE: truthy("SWUST_CODE_DISABLE_AUTOUPDATE"),

  // Defaults to false (rotation enabled). When enabled, the active log file is
  // never archived to <name>.log.<stamp> on hitting MAX_FILE_SIZE — it grows in
  // place. Useful when an external tool tails/manages the single log file.
  SWUST_CODE_DISABLE_LOG_ROTATION: truthy("SWUST_CODE_DISABLE_LOG_ROTATION"),

  // Defaults to true (analytics enabled). Set SWUST_CODE_ENABLE_ANALYSIS=false
  // to opt out of POSTing model_call/tool_call/agent_request metrics.
  SWUST_CODE_ENABLE_ANALYSIS: !falsy("SWUST_CODE_ENABLE_ANALYSIS"),
  SWUST_CODE_ALWAYS_NOTIFY_UPDATE: truthy("SWUST_CODE_ALWAYS_NOTIFY_UPDATE"),
  SWUST_CODE_DISABLE_PRUNE: truthy("SWUST_CODE_DISABLE_PRUNE"),
  SWUST_CODE_DISABLE_TERMINAL_TITLE: truthy("SWUST_CODE_DISABLE_TERMINAL_TITLE"),
  SWUST_CODE_SHOW_TTFD: truthy("SWUST_CODE_SHOW_TTFD"),
  SWUST_CODE_PERMISSION: process.env["SWUST_CODE_PERMISSION"],
  SWUST_CODE_DISABLE_DEFAULT_PLUGINS: truthy("SWUST_CODE_DISABLE_DEFAULT_PLUGINS"),
  SWUST_CODE_DISABLE_LSP_DOWNLOAD: truthy("SWUST_CODE_DISABLE_LSP_DOWNLOAD"),
  SWUST_CODE_ENABLE_EXPERIMENTAL_MODELS: truthy("SWUST_CODE_ENABLE_EXPERIMENTAL_MODELS"),
  SWUST_CODE_DISABLE_AUTOCOMPACT: truthy("SWUST_CODE_DISABLE_AUTOCOMPACT"),
  SWUST_CODE_DISABLE_MODELS_FETCH: truthy("SWUST_CODE_DISABLE_MODELS_FETCH"),
  SWUST_CODE_DISABLE_MOUSE: truthy("SWUST_CODE_DISABLE_MOUSE"),
  SWUST_CODE_OUTPUT_LENGTH_CONTINUATION_LIMIT: number("SWUST_CODE_OUTPUT_LENGTH_CONTINUATION_LIMIT") ?? 3,
  SWUST_CODE_INVALID_OUTPUT_CONTINUATION_LIMIT: number("SWUST_CODE_INVALID_OUTPUT_CONTINUATION_LIMIT") ?? 2,

  // Caps applied to image attachments before a prompt is sent. Both default to
  // undefined (no limit). SWUST_CODE_MAX_PROMPT_IMAGES bounds how many images may
  // be sent per request (oldest excess images are dropped); SWUST_CODE_MAX_PROMPT_IMAGE_SIZE
  // bounds the decoded byte size of a single image. Values must be positive integers.
  SWUST_CODE_MAX_PROMPT_IMAGES: number("SWUST_CODE_MAX_PROMPT_IMAGES"),
  SWUST_CODE_MAX_PROMPT_IMAGE_SIZE: number("SWUST_CODE_MAX_PROMPT_IMAGE_SIZE"),
  SWUST_CODE_MIMO_ONLY,
  SWUST_CODE_DISABLE_PROVIDER_ENV: SWUST_CODE_MIMO_ONLY || truthy("SWUST_CODE_DISABLE_PROVIDER_ENV"),
  SWUST_CODE_DISABLE_CLAUDE_CODE,
  get SWUST_CODE_DISABLE_CLAUDE_CODE_MCP() {
    // MCP compatibility stays on in mimo-only mode so users can reuse Claude Code
    // MCP servers without inheriting prompts, skills, or provider env keys.
    return SWUST_CODE_DISABLE_CLAUDE_CODE_ENV || truthy("SWUST_CODE_DISABLE_CLAUDE_CODE_MCP")
  },
  SWUST_CODE_DISABLE_CLAUDE_CODE_PROMPT: SWUST_CODE_DISABLE_CLAUDE_CODE || truthy("SWUST_CODE_DISABLE_CLAUDE_CODE_PROMPT"),
  // Defaults to false (enabled): markdown commands under ~/.claude/commands and
  // {project}/.claude/commands load as slash commands. Independent of the
  // mimo-only master switch. Set SWUST_CODE_DISABLE_CLAUDE_CODE_COMMANDS=true to disable.
  SWUST_CODE_DISABLE_CLAUDE_CODE_COMMANDS: truthy("SWUST_CODE_DISABLE_CLAUDE_CODE_COMMANDS"),
  SWUST_CODE_DISABLE_CLAUDE_CODE_SKILLS,
  SWUST_CODE_DISABLE_EXTERNAL_SKILLS,
  SWUST_CODE_DISABLE_CODEX_SKILLS: SWUST_CODE_DISABLE_EXTERNAL_SKILLS || truthy("SWUST_CODE_DISABLE_CODEX_SKILLS"),
  SWUST_CODE_DISABLE_OPENCODE_SKILLS: SWUST_CODE_DISABLE_EXTERNAL_SKILLS || truthy("SWUST_CODE_DISABLE_OPENCODE_SKILLS"),
  SWUST_CODE_FAKE_VCS: process.env["SWUST_CODE_FAKE_VCS"],

  // When enabled, skips all git subprocess calls during project discovery
  // (which git, rev-parse --git-common-dir, rev-parse --show-toplevel) and
  // branch detection. The project is treated as a non-git directory rooted at
  // the working directory. Use to avoid touching git in restricted/sandboxed
  // environments or where git startup probing is undesirable.
  SWUST_CODE_DISABLE_GIT: truthy("SWUST_CODE_DISABLE_GIT"),
  SWUST_CODE_SERVER_PASSWORD: process.env["SWUST_CODE_SERVER_PASSWORD"],
  SWUST_CODE_SERVER_USERNAME: process.env["SWUST_CODE_SERVER_USERNAME"],
  SWUST_CODE_ENABLE_QUESTION_TOOL: truthy("SWUST_CODE_ENABLE_QUESTION_TOOL"),

  // Experimental
  SWUST_CODE_EXPERIMENTAL,
  SWUST_CODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("SWUST_CODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SWUST_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SWUST_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SWUST_CODE_EXPERIMENTAL_ICON_DISCOVERY: SWUST_CODE_EXPERIMENTAL || truthy("SWUST_CODE_EXPERIMENTAL_ICON_DISCOVERY"),
  SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SWUST_CODE_ENABLE_EXA: truthy("SWUST_CODE_ENABLE_EXA") || SWUST_CODE_EXPERIMENTAL || truthy("SWUST_CODE_EXPERIMENTAL_EXA"),
  SWUST_CODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("SWUST_CODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  SWUST_CODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("SWUST_CODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  SWUST_CODE_EXPERIMENTAL_OXFMT: SWUST_CODE_EXPERIMENTAL || truthy("SWUST_CODE_EXPERIMENTAL_OXFMT"),
  SWUST_CODE_EXPERIMENTAL_LSP_TY: truthy("SWUST_CODE_EXPERIMENTAL_LSP_TY"),
  SWUST_CODE_EXPERIMENTAL_LSP_TOOL: SWUST_CODE_EXPERIMENTAL || truthy("SWUST_CODE_EXPERIMENTAL_LSP_TOOL"),
  // Defaults to true: dynamic workflow + built-in deep-research are on by default.
  // Set SWUST_CODE_EXPERIMENTAL_WORKFLOW_TOOL=false to opt out. The env-var name is
  // kept for backwards compat (long-running experiments still pass it as `1`).
  SWUST_CODE_EXPERIMENTAL_WORKFLOW_TOOL: !falsy("SWUST_CODE_EXPERIMENTAL_WORKFLOW_TOOL"),
  SWUST_CODE_EXPERIMENTAL_MARKDOWN: !falsy("SWUST_CODE_EXPERIMENTAL_MARKDOWN"),
  SWUST_CODE_MODELS_URL: process.env["SWUST_CODE_MODELS_URL"],
  SWUST_CODE_MODELS_PATH: process.env["SWUST_CODE_MODELS_PATH"],
  SWUST_CODE_DISABLE_EMBEDDED_WEB_UI: truthy("SWUST_CODE_DISABLE_EMBEDDED_WEB_UI"),
  SWUST_CODE_DB: process.env["SWUST_CODE_DB"],

  // Defaults to true — all channels share a single swust-code.db. The per-channel
  // DB isolation (swust-code-{channel}.db) is unnecessary for swust-code since we
  // don't ship multiple release channels yet. Use SWUST_CODE_HOME to isolate dev
  // environments instead. Set SWUST_CODE_DISABLE_CHANNEL_DB=false to restore
  // per-channel isolation.
  SWUST_CODE_DISABLE_CHANNEL_DB: !falsy("SWUST_CODE_DISABLE_CHANNEL_DB"),
  SWUST_CODE_SKIP_MIGRATIONS: truthy("SWUST_CODE_SKIP_MIGRATIONS"),
  SWUST_CODE_STRICT_CONFIG_DEPS: truthy("SWUST_CODE_STRICT_CONFIG_DEPS"),

  SWUST_CODE_WORKSPACE_ID: process.env["SWUST_CODE_WORKSPACE_ID"],
  SWUST_CODE_EXPERIMENTAL_HTTPAPI: truthy("SWUST_CODE_EXPERIMENTAL_HTTPAPI"),
  SWUST_CODE_EXPERIMENTAL_WORKSPACES: SWUST_CODE_EXPERIMENTAL || truthy("SWUST_CODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get SWUST_CODE_DISABLE_COMPOSE_SKILLS() {
    return truthy("SWUST_CODE_DISABLE_COMPOSE_SKILLS")
  },
  get SWUST_CODE_DISABLE_PROJECT_CONFIG() {
    return truthy("SWUST_CODE_DISABLE_PROJECT_CONFIG")
  },
  get SWUST_CODE_TUI_CONFIG() {
    return process.env["SWUST_CODE_TUI_CONFIG"]
  },
  get SWUST_CODE_CONFIG_DIR() {
    return process.env["SWUST_CODE_CONFIG_DIR"]
  },
  get SWUST_CODE_HOME() {
    return process.env["SWUST_CODE_HOME"]
  },
  get SWUST_CODE_PURE() {
    return truthy("SWUST_CODE_PURE")
  },
  get SWUST_CODE_PLUGIN_META_FILE() {
    return process.env["SWUST_CODE_PLUGIN_META_FILE"]
  },
  get SWUST_CODE_CLIENT() {
    return process.env["SWUST_CODE_CLIENT"] ?? "cli"
  },
}
