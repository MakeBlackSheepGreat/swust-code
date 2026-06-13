import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["SWUST_CODE_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("SWUST_CODE_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SWUST_CODE_AUTO_HEAP_SNAPSHOT: truthy("SWUST_CODE_AUTO_HEAP_SNAPSHOT"),
  SWUST_CODE_GIT_BASH_PATH: process.env["SWUST_CODE_GIT_BASH_PATH"],
  SWUST_CODE_CONFIG: process.env["SWUST_CODE_CONFIG"],
  SWUST_CODE_CONFIG_CONTENT: process.env["SWUST_CODE_CONFIG_CONTENT"],
  SWUST_CODE_DISABLE_AUTOUPDATE: truthy("SWUST_CODE_DISABLE_AUTOUPDATE"),
  SWUST_CODE_ALWAYS_NOTIFY_UPDATE: truthy("SWUST_CODE_ALWAYS_NOTIFY_UPDATE"),
  SWUST_CODE_DISABLE_PRUNE: truthy("SWUST_CODE_DISABLE_PRUNE"),
  SWUST_CODE_DISABLE_TERMINAL_TITLE: truthy("SWUST_CODE_DISABLE_TERMINAL_TITLE"),
  SWUST_CODE_SHOW_TTFD: truthy("SWUST_CODE_SHOW_TTFD"),
  SWUST_CODE_DISABLE_AUTOCOMPACT: truthy("SWUST_CODE_DISABLE_AUTOCOMPACT"),
  SWUST_CODE_DISABLE_MODELS_FETCH: truthy("SWUST_CODE_DISABLE_MODELS_FETCH"),
  SWUST_CODE_DISABLE_MOUSE: truthy("SWUST_CODE_DISABLE_MOUSE"),
  SWUST_CODE_FAKE_VCS: process.env["SWUST_CODE_FAKE_VCS"],
  SWUST_CODE_SERVER_PASSWORD: process.env["SWUST_CODE_SERVER_PASSWORD"],
  SWUST_CODE_SERVER_USERNAME: process.env["SWUST_CODE_SERVER_USERNAME"],
  SWUST_CODE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("SWUST_CODE_DISABLE_FFF"),

  // Experimental
  SWUST_CODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("SWUST_CODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SWUST_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SWUST_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SWUST_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SWUST_CODE_MODELS_URL: process.env["SWUST_CODE_MODELS_URL"],
  SWUST_CODE_MODELS_PATH: process.env["SWUST_CODE_MODELS_PATH"],
  SWUST_CODE_DB: process.env["SWUST_CODE_DB"],

  SWUST_CODE_WORKSPACE_ID: process.env["SWUST_CODE_WORKSPACE_ID"],
  SWUST_CODE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("SWUST_CODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get SWUST_CODE_DISABLE_PROJECT_CONFIG() {
    return truthy("SWUST_CODE_DISABLE_PROJECT_CONFIG")
  },
  get SWUST_CODE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("SWUST_CODE_EXPERIMENTAL_REFERENCES")
  },
  get SWUST_CODE_TUI_CONFIG() {
    return process.env["SWUST_CODE_TUI_CONFIG"]
  },
  get SWUST_CODE_CONFIG_DIR() {
    return process.env["SWUST_CODE_CONFIG_DIR"]
  },
  get SWUST_CODE_PURE() {
    return truthy("SWUST_CODE_PURE")
  },
  get SWUST_CODE_PERMISSION() {
    return process.env["SWUST_CODE_PERMISSION"]
  },
  get SWUST_CODE_PLUGIN_META_FILE() {
    return process.env["SWUST_CODE_PLUGIN_META_FILE"]
  },
  get SWUST_CODE_CLIENT() {
    return process.env["SWUST_CODE_CLIENT"] ?? "cli"
  },
  get SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH() {
    const val = process.env["SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH"]
    return val === undefined ? true : truthy("SWUST_CODE_MEMORY_RECONCILE_ON_SEARCH")
  },
  get SWUST_CODE_MEMORY_SEARCH_SCORE_FLOOR() {
    const val = process.env["SWUST_CODE_MEMORY_SEARCH_SCORE_FLOOR"]
    return val === undefined ? 0.15 : parseFloat(val)
  },
}
