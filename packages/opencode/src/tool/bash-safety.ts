/**
 * Bash command safety analyzer.
 * Detects dangerous patterns in shell commands without executing them.
 * Pure function module - no side effects.
 */

export type RiskLevel = "safe" | "caution" | "dangerous"

export interface SafetyAnalysis {
  readonly level: RiskLevel
  readonly reason?: string
  readonly pattern?: string
}

const DANGEROUS_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [
  { pattern: /\brm\s+(-[rRf]+\s+|--recursive)/, reason: "Recursive file deletion" },
  { pattern: /\brm\s+(-[rRf]*\s+)?\//, reason: "Deletion from root path" },
  { pattern: />\s*\/(etc|usr|bin|sbin|lib)\//, reason: "Write to system directory" },
  { pattern: /\|\s*(ba)?sh\b/, reason: "Pipe to shell interpreter" },
  { pattern: /\beval\s+/, reason: "Dynamic code evaluation" },
  { pattern: /\bchmod\s+(-[R]+\s+)?777/, reason: "Setting world-writable permissions" },
  { pattern: /\bchmod\s+(-[R]+\s+)?\+s/, reason: "Setting SUID/SGID bits" },
  { pattern: /\bcurl\s+.*\|\s*(ba)?sh/, reason: "Download and execute script" },
  { pattern: /\bwget\s+.*\|\s*(ba)?sh/, reason: "Download and execute script" },
  { pattern: /\bmkfs\b/, reason: "Filesystem formatting" },
  { pattern: /\bdd\s+.*of=\/dev\//, reason: "Direct device write" },
  { pattern: /:\(\)\s*\{/, reason: "Fork bomb definition" },
  { pattern: /\bkill\s+-9\s+-1/, reason: "Kill all processes" },
  { pattern: /\bsudo\s+rm/, reason: "Privileged file deletion" },
  { pattern: /\bnc\s+.*-[elp]/, reason: "Netcat listener (potential backdoor)" },
  { pattern: /\bpython[23]?\s+-c\s+.*import\s+os/, reason: "Python OS command execution" },
  { pattern: /\bnode\s+-e\s+.*require\(.child_process/, reason: "Node.js child_process execution" },
]

const CAUTION_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [
  { pattern: /\brm\s+/, reason: "File deletion" },
  { pattern: /\bmv\s+/, reason: "File move/rename" },
  { pattern: /\bcp\s+.*-[rR]/, reason: "Recursive copy" },
  { pattern: />\s*[^>]/, reason: "File overwrite (single redirect)" },
  { pattern: /\bgit\s+push\s+.*--force/, reason: "Force push" },
  { pattern: /\bgit\s+reset\s+--hard/, reason: "Hard reset (discards changes)" },
  { pattern: /\bgit\s+clean\s+-[fF]/, reason: "Force clean untracked files" },
  { pattern: /\bnpm\s+publish/, reason: "Package publication" },
  { pattern: /\bdocker\s+rm/, reason: "Container removal" },
  { pattern: /\bdocker\s+rmi/, reason: "Image removal" },
  { pattern: /\bssh\b/, reason: "Remote shell access" },
  { pattern: /\bscp\b/, reason: "Remote file copy" },
]

export function analyzeBashCommand(command: string): SafetyAnalysis {
  const normalized = command.trim()

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { level: "dangerous", reason, pattern: pattern.source }
    }
  }

  for (const { pattern, reason } of CAUTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { level: "caution", reason, pattern: pattern.source }
    }
  }

  return { level: "safe" }
}

export function isReadOnlyCommand(command: string): boolean {
  const analysis = analyzeBashCommand(command)
  return analysis.level === "safe"
}

export function formatSafetyReport(analysis: SafetyAnalysis): string {
  switch (analysis.level) {
    case "safe":
      return "Command appears safe."
    case "caution":
      return `Caution: ${analysis.reason}. Review before executing.`
    case "dangerous":
      return `DANGER: ${analysis.reason}. This command should NOT be executed without explicit user approval.`
  }
}
