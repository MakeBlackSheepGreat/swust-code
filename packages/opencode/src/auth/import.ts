/**
 * Credential Import - import API keys from MiMo-Code and Claude Code.
 *
 * Supports:
 * - MiMo-Code: reads ~/.local/share/mimocode/data/auth.json (identical schema)
 * - Claude Code: reads ~/.claude/.credentials.json + ~/.claude.json
 * - Environment variables: ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
 *
 * All imports are non-destructive: existing SWUST Code credentials are preserved.
 */

import fs from "fs"
import path from "path"
import os from "os"

export interface ImportResult {
  readonly source: string
  readonly imported: ReadonlyArray<{ provider: string; type: string }>
  readonly skipped: ReadonlyArray<{ provider: string; reason: string }>
  readonly errors: ReadonlyArray<string>
}

/**
 * Resolve the home directory cross-platform.
 */
function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir()
}

// ---------------------------------------------------------------------------
// MiMo-Code Import
// ---------------------------------------------------------------------------

function mimocodeAuthPath(): string | null {
  const home = homeDir()
  // XDG default (no data/ subdirectory - MiMo stores auth.json directly)
  const xdg = path.join(home, ".local", "share", "mimocode", "auth.json")
  if (fs.existsSync(xdg)) return xdg
  // XDG with data/ subdirectory
  const xdgData = path.join(home, ".local", "share", "mimocode", "data", "auth.json")
  if (fs.existsSync(xdgData)) return xdgData
  // macOS default
  const macos = path.join(home, "Library", "Application Support", "mimocode", "auth.json")
  if (fs.existsSync(macos)) return macos
  // MIMOCODE_HOME env
  const envHome = process.env.MIMOCODE_HOME
  if (envHome) {
    const envPath = path.join(envHome, "data", "auth.json")
    if (fs.existsSync(envPath)) return envPath
  }
  return null
}

/**
 * Import credentials from MiMo-Code's auth.json.
 * Schema is identical to SWUST Code, so direct copy works.
 */
export function importFromMimocode(): ImportResult {
  const authPath = mimocodeAuthPath()
  if (!authPath) {
    return { source: "MiMo-Code", imported: [], skipped: [], errors: ["MiMo-Code auth.json not found"] }
  }

  try {
    const raw = JSON.parse(fs.readFileSync(authPath, "utf-8"))
    const imported: Array<{ provider: string; type: string }> = []
    const skipped: Array<{ provider: string; reason: string }> = []

    for (const [provider, entry] of Object.entries(raw)) {
      if (entry && typeof entry === "object" && "type" in entry) {
        imported.push({ provider, type: (entry as any).type })
      } else {
        skipped.push({ provider, reason: "invalid entry format" })
      }
    }

    return { source: "MiMo-Code", imported, skipped, errors: [] }
  } catch (e) {
    return { source: "MiMo-Code", imported: [], skipped: [], errors: [`Failed to read: ${e}`] }
  }
}

// ---------------------------------------------------------------------------
// Claude Code Import
// ---------------------------------------------------------------------------

function claudeCodeCredentialsPath(): string | null {
  const home = homeDir()
  const credPath = path.join(home, ".claude", ".credentials.json")
  if (fs.existsSync(credPath)) return credPath
  return null
}

function claudeCodeConfigPath(): string | null {
  const home = homeDir()
  const configPath = path.join(home, ".claude.json")
  if (fs.existsSync(configPath)) return configPath
  // Also check CLAUDE_CONFIG_DIR
  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir) {
    const p = path.join(configDir, ".credentials.json")
    if (fs.existsSync(p)) return p
  }
  return null
}

interface ClaudeCodeCredential {
  claudeAiOauth?: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes?: string[]
    subscriptionType?: string
    rateLimitTier?: string
  }
  anthropicApiKey?: string
}

/**
 * Import credentials from Claude Code.
 * Maps Claude Code's auth format to SWUST Code's auth.json format.
 */
export function importFromClaudeCode(): ImportResult {
  const imported: Array<{ provider: string; type: string }> = []
  const skipped: Array<{ provider: string; reason: string }> = []
  const errors: Array<string> = []

  // Try credentials file
  const credPath = claudeCodeCredentialsPath()
  if (credPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, "utf-8")) as ClaudeCodeCredential

      // Import Anthropic OAuth token
      if (raw.claudeAiOauth) {
        imported.push({ provider: "anthropic", type: "oauth" })
      }

      // Import Anthropic API key
      if (raw.anthropicApiKey) {
        imported.push({ provider: "anthropic", type: "api" })
      }
    } catch (e) {
      errors.push(`Failed to read credentials: ${e}`)
    }
  } else {
    skipped.push({ provider: "anthropic", reason: "Claude Code credentials file not found" })
  }

  // Try config file for API key
  const configPath = claudeCodeConfigPath()
  if (configPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"))
      if (raw.primaryApiKey && !imported.some(i => i.provider === "anthropic")) {
        imported.push({ provider: "anthropic", type: "api" })
      }
    } catch (e) {
      // Config file is optional, don't add to errors
    }
  }

  return { source: "Claude Code", imported, skipped, errors }
}

// ---------------------------------------------------------------------------
// Environment Variables Import
// ---------------------------------------------------------------------------

const ENV_PROVIDER_MAP: Record<string, { provider: string; key: string }> = {
  ANTHROPIC_API_KEY: { provider: "anthropic", key: "ANTHROPIC_API_KEY" },
  OPENAI_API_KEY: { provider: "openai", key: "OPENAI_API_KEY" },
  DEEPSEEK_API_KEY: { provider: "deepseek", key: "DEEPSEEK_API_KEY" },
  GOOGLE_API_KEY: { provider: "google", key: "GOOGLE_API_KEY" },
  GROQ_API_KEY: { provider: "groq", key: "GROQ_API_KEY" },
  MISTRAL_API_KEY: { provider: "mistral", key: "MISTRAL_API_KEY" },
  XAI_API_KEY: { provider: "xai", key: "XAI_API_KEY" },
  COHERE_API_KEY: { provider: "cohere", key: "COHERE_API_KEY" },
  OPENROUTER_API_KEY: { provider: "openrouter", key: "OPENROUTER_API_KEY" },
}

/**
 * Import API keys from environment variables.
 */
export function importFromEnv(): ImportResult {
  const imported: Array<{ provider: string; type: string }> = []
  const skipped: Array<{ provider: string; reason: string }> = []

  for (const [envVar, { provider }] of Object.entries(ENV_PROVIDER_MAP)) {
    const value = process.env[envVar]
    if (value && value.length > 0) {
      imported.push({ provider, type: "api (env)" })
    } else {
      skipped.push({ provider, reason: `${envVar} not set` })
    }
  }

  return { source: "Environment Variables", imported, skipped, errors: [] }
}

// ---------------------------------------------------------------------------
// Unified Import
// ---------------------------------------------------------------------------

/**
 * Run all import sources and return combined results.
 */
export function importAll(): ReadonlyArray<ImportResult> {
  return [
    importFromMimocode(),
    importFromClaudeCode(),
    importFromEnv(),
  ]
}

/**
 * Merge all import results into a single auth.json-compatible object.
 * Returns the provider → auth entry mapping that can be written to auth.json.
 */
export function mergeImportedCredentials(): Record<string, unknown> {
  const merged: Record<string, unknown> = {}

  // MiMo-Code (direct copy)
  const mimoPath = mimocodeAuthPath()
  if (mimoPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(mimoPath, "utf-8"))
      for (const [provider, entry] of Object.entries(raw)) {
        if (entry && typeof entry === "object" && "type" in (entry as any)) {
          merged[provider] = entry
        }
      }
    } catch {}
  }

  // Claude Code (Anthropic API key)
  const credPath = claudeCodeCredentialsPath()
  if (credPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, "utf-8")) as ClaudeCodeCredential
      if (raw.anthropicApiKey && !merged.anthropic) {
        merged.anthropic = { type: "api", key: raw.anthropicApiKey }
      }
      if (raw.claudeAiOauth && !merged.anthropic) {
        merged.anthropic = {
          type: "oauth",
          refresh: raw.claudeAiOauth.refreshToken,
          access: raw.claudeAiOauth.accessToken,
          expires: Math.floor(raw.claudeAiOauth.expiresAt / 1000),
        }
      }
    } catch {}
  }

  // Environment variables
  for (const [envVar, { provider }] of Object.entries(ENV_PROVIDER_MAP)) {
    const value = process.env[envVar]
    if (value && value.length > 0 && !merged[provider]) {
      merged[provider] = { type: "api", key: value }
    }
  }

  return merged
}
