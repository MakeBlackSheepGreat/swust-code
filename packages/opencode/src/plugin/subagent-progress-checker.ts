import type { Hooks, PluginInput } from "@swust-code/plugin"
import fs from "fs/promises"
import path from "path"
import { progressPath } from "@/session/checkpoint-paths"
import type { SessionID } from "@/session/schema"

const REQUIRED_SECTIONS = [
  "## §1 Task identity",
  "## §2 Subagent intent",
  "## §3 Files and code sections",
  "## §4 Verbatim commands",
  "## §5 Outcome and discoveries",
] as const

const TEMPLATE = `## §1 Task identity
- task_id: <TID>
- short summary: <one line>

## §2 Subagent intent
What this subagent was asked to do (one paragraph).

## §3 Files and code sections
- path/to/file.ext: <what you did with it>

## §4 Verbatim commands
Exact commands you ran or commands the user/task asked to be runnable later. Keep BACKTICK-FENCED for grep-ability.
\`\`\`
<command>
\`\`\`

## §5 Outcome and discoveries
- Outcome (success/partial/failed): <reason>
- Discoveries that may matter for other tasks: <bullets>
`

function buildFeedback(args: {
  kind: "missing" | "incomplete"
  taskId: string
  filePath: string
  missing?: readonly string[]
}): string {
  if (args.kind === "missing") {
    return [
      "Before terminating, write the task progress journal to:",
      `  ${args.filePath}`,
      "",
      "Required structure (5 sections, headings exact):",
      "",
      TEMPLATE.replace("<TID>", args.taskId),
      "",
      "Write the file now using the Write tool, then terminate normally.",
    ].join("\n")
  }

  return [
    `tasks/${args.taskId}/progress.md exists but is missing required sections:`,
    ...(args.missing ?? []).map((section) => `  - ${section}`),
    "",
    "Add the missing sections. For reference, the full required template is:",
    "",
    TEMPLATE.replace("<TID>", args.taskId),
    "",
    "Re-write the file using Write tool, then terminate normally.",
  ].join("\n")
}

async function injectFrontmatter(filePath: string, body: string): Promise<void> {
  const now = Date.now()
  const frontmatterBlock = `---\nwritten-at: ${now}\n---\n`
  const fmMatch = body.match(/^---\n[\s\S]*?\n---\n/)
  const newBody = fmMatch ? frontmatterBlock + body.slice(fmMatch[0].length) : frontmatterBlock + body
  await Bun.write(filePath, newBody)
}

export async function SubagentProgressCheckerPlugin(_pluginInput: PluginInput): Promise<Hooks> {
  return {
    "actor.postStop": {
      matcher: {
        agentType: {
          excludeOnly: ["checkpoint-writer", "title", "summary", "dream", "distill", "compaction", "main"],
        },
      },
      run: async (input, output) => {
        const taskId = (input as { task_id?: string }).task_id
        if (!taskId) return
        if ((input as { canWrite?: boolean }).canWrite === false) return

        const sessionID = input.sessionID as SessionID
        const filePath = progressPath(sessionID, taskId)

        let body: string | undefined
        try {
          body = await Bun.file(filePath).text()
        } catch {
          body = undefined
        }

        if (body === undefined) {
          output.continue = true
          output.reason = buildFeedback({ kind: "missing", taskId, filePath })
          return
        }

        const missing = REQUIRED_SECTIONS.filter((section) => !body!.includes(section))
        if (missing.length > 0) {
          output.continue = true
          output.reason = buildFeedback({ kind: "incomplete", taskId, filePath, missing })
          return
        }

        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await injectFrontmatter(filePath, body)
        } catch {
          // Progress validation should not block actor shutdown if metadata stamping fails.
        }
      },
    },
  }
}
