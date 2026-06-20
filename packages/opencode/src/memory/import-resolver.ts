/**
 * @path Import Directive - inline file references in memory documents.
 *
 * Memory files (MEMORY.md, etc.) can reference other files
 * using `@path` on its own line. The referenced file's content replaces
 * the directive inline.
 *
 * Features:
 * - Recursive resolution (depth limit: 5)
 * - Cycle detection via absolute path tracking
 * - ~ expands to home directory
 * - Relative paths resolve from the base file's directory
 * - Failed imports are left as-is (visible to user)
 */

import path from "path"
import fs from "fs"

const MAX_IMPORT_DEPTH = 5

/**
 * Check if a line is an import directive.
 * Returns the target path if it is, null otherwise.
 *
 * Rules:
 * - Must start with `@`
 * - Must be the only token on the line
 * - Must contain a path separator or dot (to avoid @mentions)
 */
export function parseImportDirective(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("@") || trimmed.length === 1) return null
  if (/\s/.test(trimmed.slice(1))) return null // multiple tokens

  const target = trimmed.slice(1)
  if (!target.includes("/") && !target.includes("\\") && !target.includes(".")) {
    return null // looks like @mention, not import
  }
  return target
}

/**
 * Resolve a target path: ~ expands to home, absolute passes through,
 * relative resolves from baseDir.
 */
export function resolveImportPath(target: string, baseDir: string): string {
  if (target.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || ""
    const rest = target.slice(1).replace(/^[/\\]+/, "")
    return path.join(home, rest)
  }
  if (path.isAbsolute(target)) return target
  return path.join(baseDir, target)
}

/**
 * Resolve @path imports in a body of text.
 * Recursively inlines referenced files up to MAX_IMPORT_DEPTH.
 * Cycle detection via absolute path set.
 */
export function resolveImports(
  body: string,
  baseDir: string,
  seen: Set<string> = new Set(),
  depth: number = 0,
): string {
  if (depth >= MAX_IMPORT_DEPTH) return body

  const lines = body.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const target = parseImportDirective(lines[i])
    if (!target) continue

    const resolved = resolveImportPath(target, baseDir)
    const abs = path.resolve(resolved)

    if (seen.has(abs)) {
      lines[i] = `${lines[i]}  <!-- skipped: import cycle -->`
      continue
    }

    try {
      const content = fs.readFileSync(abs, "utf-8").trim()
      if (!content) continue

      seen.add(abs)
      const resolvedContent = resolveImports(content, path.dirname(abs), seen, depth + 1)
      seen.delete(abs)

      lines[i] = resolvedContent
    } catch {
      // Leave the @line untouched if file can't be read
    }
  }

  return lines.join("\n")
}
