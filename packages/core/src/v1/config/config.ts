export * as ConfigV1 from "./config"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, type DeepMutable } from "../../schema"
import { ConfigExperimental } from "../../config/experimental"
import { ConfigReference } from "../../config/reference"
import { ConfigAgentV1 } from "./agent"
import { ConfigAttachmentV1 } from "./attachment"
import { ConfigCommandV1 } from "./command"
import { ConfigFormatterV1 } from "./formatter"
import { ConfigHistoryV1 } from "./history"
import { ConfigLayoutV1 } from "./layout"
import { ConfigLSPV1 } from "./lsp"
import { ConfigMCPV1 } from "./mcp"
import { ConfigPermissionV1 } from "./permission"
import { ConfigPluginV1 } from "./plugin"
import { ConfigProviderV1 } from "./provider"
import { ConfigServerV1 } from "./server"
import { ConfigSkillsV1 } from "./skills"

export type Layout = ConfigLayoutV1.Layout

export const WellKnown = Schema.Struct({
  config: Schema.optional(Schema.Json),
  remote_config: Schema.optional(Schema.Json),
})

const LogLevelRef = Schema.Literals(["DEBUG", "INFO", "WARN", "ERROR"]).annotate({
  identifier: "LogLevel",
  description: "Log level",
})

export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  shell: Schema.optional(Schema.String).annotate({ description: "Default shell to use for terminal and bash tool" }),
  logLevel: Schema.optional(LogLevelRef).annotate({ description: "Log level" }),
  server: Schema.optional(ConfigServerV1.Server).annotate({
    description: "Server configuration for opencode serve and web commands",
  }),
  command: Schema.optional(Schema.Record(Schema.String, ConfigCommandV1.Info)).annotate({
    description: "Command configuration, see https://opencode.ai/docs/commands",
  }),
  skills: Schema.optional(ConfigSkillsV1.Info).annotate({ description: "Additional skill folder paths" }),
  references: Schema.optional(ConfigReference.Info).annotate({
    description: "Named git or local directory references",
  }),
  reference: Schema.optional(ConfigReference.Info).annotate({
    description: "@deprecated Use 'references' field instead. Named git or local directory references",
  }),
  watcher: Schema.optional(Schema.Struct({ ignore: Schema.optional(Schema.mutable(Schema.Array(Schema.String))) })),
  snapshot: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable or disable snapshot tracking. When false, filesystem snapshots are not recorded and undoing or reverting will not undo/redo file changes. Defaults to true.",
  }),
  plugin: Schema.optional(Schema.mutable(Schema.Array(ConfigPluginV1.Spec))),
  share: Schema.optional(Schema.Literals(["manual", "auto", "disabled"])).annotate({
    description:
      "Control sharing behavior:'manual' allows manual sharing via commands, 'auto' enables automatic sharing, 'disabled' disables all sharing",
  }),
  tool: Schema.optional(
    Schema.Struct({
      invocation_style: Schema.optional(Schema.Literals(["json", "shell"])).annotate({
        description:
          "Default invocation style for all tools. 'json' exposes the original schema; 'shell' exposes a single script parameter for tools that provide shell parsing.",
      }),
      invocation_style_by_tool: Schema.optional(
        Schema.Record(Schema.String, Schema.Literals(["json", "shell"])),
      ).annotate({
        description:
          "Per-tool invocation style override. Keys are tool IDs. Tools without shell parsing fall back to JSON.",
      }),
    }),
  ).annotate({ description: "Tool invocation style configuration." }),
  autoshare: Schema.optional(Schema.Boolean).annotate({
    description: "@deprecated Use 'share' field instead. Share newly created sessions automatically",
  }),
  autoupdate: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("notify")])).annotate({
    description:
      "Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications",
  }),
  disabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Disable providers that are loaded automatically",
  }),
  enabled_providers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "When set, ONLY these providers will be enabled. All other providers will be ignored",
  }),
  model: Schema.optional(Schema.String).annotate({
    description: "Model to use in the format of provider/model, eg anthropic/claude-2",
  }),
  small_model: Schema.optional(Schema.String).annotate({
    description: "Small model to use for tasks like title generation in the format of provider/model",
  }),
  default_agent: Schema.optional(Schema.String).annotate({
    description:
      "Default agent to use when none is specified. Must be a primary agent. Falls back to 'build' if not set or if the specified agent is invalid.",
  }),
  username: Schema.optional(Schema.String).annotate({
    description: "Custom username to display in conversations instead of system username",
  }),
  mode: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({ build: Schema.optional(ConfigAgentV1.Info), plan: Schema.optional(ConfigAgentV1.Info) }),
      [Schema.Record(Schema.String, ConfigAgentV1.Info)],
    ),
  ).annotate({ description: "@deprecated Use `agent` field instead." }),
  agent: Schema.optional(
    Schema.StructWithRest(
      Schema.Struct({
        plan: Schema.optional(ConfigAgentV1.Info),
        build: Schema.optional(ConfigAgentV1.Info),
        general: Schema.optional(ConfigAgentV1.Info),
        explore: Schema.optional(ConfigAgentV1.Info),
        title: Schema.optional(ConfigAgentV1.Info),
        summary: Schema.optional(ConfigAgentV1.Info),
        compaction: Schema.optional(ConfigAgentV1.Info),
      }),
      [Schema.Record(Schema.String, ConfigAgentV1.Info)],
    ),
  ).annotate({ description: "Agent configuration, see https://opencode.ai/docs/agents" }),
  provider: Schema.optional(Schema.Record(Schema.String, ConfigProviderV1.Info)).annotate({
    description: "Custom provider configurations and model overrides",
  }),
  mcp: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([ConfigMCPV1.Info, Schema.Struct({ enabled: Schema.Boolean })])),
  ).annotate({ description: "MCP (Model Context Protocol) server configurations" }),
  formatter: Schema.optional(ConfigFormatterV1.Info).annotate({
    description:
      "Enable or configure formatters. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.",
  }),
  history: Schema.optional(ConfigHistoryV1.Info).annotate({
    description: "Trajectory (conversation history) FTS index configuration.",
  }),
  lsp: Schema.optional(ConfigLSPV1.Info).annotate({
    description:
      "Enable or configure LSP servers. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.",
  }),
  instructions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional instruction files or patterns to include",
  }),
  layout: Schema.optional(ConfigLayoutV1.Layout).annotate({ description: "@deprecated Always uses stretch layout." }),
  permission: Schema.optional(ConfigPermissionV1.Info),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  attachment: Schema.optional(ConfigAttachmentV1.Info).annotate({
    description: "Attachment processing configuration, including image size limits and resizing behavior",
  }),
  enterprise: Schema.optional(
    Schema.Struct({ url: Schema.optional(Schema.String).annotate({ description: "Enterprise URL" }) }),
  ),
  tool_output: Schema.optional(
    Schema.Struct({
      max_lines: Schema.optional(PositiveInt).annotate({
        description: "Maximum lines of tool output before it is truncated and saved to disk (default: 2000)",
      }),
      max_bytes: Schema.optional(PositiveInt).annotate({
        description: "Maximum bytes of tool output before it is truncated and saved to disk (default: 51200)",
      }),
    }),
  ).annotate({
    description:
      "Thresholds for truncating tool output. When output exceeds either limit, the full text is written to the truncation directory and a preview is returned.",
  }),
  dream: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean).annotate({
        description: "Auto-trigger dream memory consolidation on new session start. Default: true.",
      }),
      interval_days: Schema.optional(NonNegativeInt).annotate({
        description: "Minimum days between automatic dream runs. Set to 0 to trigger on every new session. Default: 7.",
      }),
    }),
  ),
  distill: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean).annotate({
        description: "Auto-trigger distill workflow packaging on new session start. Default: true.",
      }),
      interval_days: Schema.optional(NonNegativeInt).annotate({
        description: "Minimum days between automatic distill runs. Default: 30.",
      }),
    }),
  ),
  compaction: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean).annotate({
        description: "Enable automatic compaction when context is full (default: true)",
      }),
      prune: Schema.optional(Schema.Boolean).annotate({
        description: "Enable pruning of old tool outputs (default: false)",
      }),
      tail_turns: Schema.optional(NonNegativeInt).annotate({
        description:
          "Number of recent user turns, including their following assistant/tool responses, to keep verbatim during compaction (default: 2)",
      }),
      preserve_recent_tokens: Schema.optional(NonNegativeInt).annotate({
        description: "Maximum number of tokens from recent turns to preserve verbatim after compaction",
      }),
      reserved: Schema.optional(NonNegativeInt).annotate({
        description: "Token buffer for compaction. Leaves enough window to avoid overflow during compaction.",
      }),
    }),
  ),
  checkpoint: Schema.optional(
    Schema.Struct({
      thresholds: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
        description:
          'Context fill thresholds that trigger checkpoint writes. Strings may be percentages ("40%"), absolute tokens ("100K", "1.5M"), or mixed ("100K", "50%"). Each threshold must be <= window - 20K reserved. Default: ["40%", "60%", "80%"].',
      }),
      reserved: Schema.optional(NonNegativeInt).annotate({
        description: "Token buffer reserved for checkpoint operations. Default: 20000.",
      }),
      max_writer_failures: Schema.optional(PositiveInt).annotate({
        description:
          "Maximum consecutive writer failures per session before checkpointing stops retrying until process restart. Default: 3.",
      }),
      fork: Schema.optional(Schema.Boolean).annotate({
        description:
          "Whether to fork the parent agent's message prefix into the writer session for prefix-cache reuse. Requires provider cache-breakpoint support. Default: false.",
      }),
      push_caps: Schema.optional(
        Schema.Struct({
          tasks_ledger: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the tasks ledger section of rebuild context. Default: 2000.",
          }),
          focus_task: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the focus task body in rebuild context. Default: 4000.",
          }),
          actor_ledger: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the actor ledger section of rebuild context. Default: 500.",
          }),
          memory_titles: Schema.optional(PositiveInt).annotate({
            description: "Token cap for memory titles in rebuild context. Default: 500.",
          }),
          global: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the global memory section (global/MEMORY.md) of rebuild context. Default: 6000.",
          }),
          checkpoint: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the session checkpoint section (checkpoint.md) of rebuild context. Default: 11000.",
          }),
          memory: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the project memory section (MEMORY.md) of rebuild context. Default: 10000.",
          }),
          notes: Schema.optional(PositiveInt).annotate({
            description: "Token cap for the session notes (notes.md) of rebuild context. Default: 6000.",
          }),
          design_decisions: Schema.optional(PositiveInt).annotate({
            description: "Token cap for section 10 Design decisions in checkpoint.md. Default: 3000.",
          }),
          open_notes: Schema.optional(PositiveInt).annotate({
            description: "Token cap for section 11 Open notes in checkpoint.md. Default: 800.",
          }),
        }),
      ).annotate({
        description:
          "Per-section token caps for checkpoint rebuild context. Each section is loaded up to its cap so the rebuild stays within a predictable budget.",
      }),
      task_archive_days: Schema.optional(PositiveInt).annotate({
        description:
          "Number of days after task done or abandoned before it is filtered out of list({ include_archived: false }). Rows are not deleted. Default: 7.",
      }),
      task_cleanup_days: Schema.optional(PositiveInt).annotate({
        description: "[deprecated] Alias for task_archive_days.",
      }),
      memory_reconcile_on_search: Schema.optional(Schema.Boolean).annotate({
        description: "Whether to reconcile memory state on search operations. Default: true.",
      }),
      memory_search_score_floor: Schema.optional(Schema.Number).annotate({
        description:
          "Relative BM25 floor for memory.search results. The top result is always kept. Default: 0.15. Set 0 to keep all matches.",
      }),
    }),
  ),
  experimental: Schema.optional(
    Schema.Struct({
      disable_paste_summary: Schema.optional(Schema.Boolean),
      predict_next_prompt: Schema.optional(Schema.Boolean).annotate({
        description: "Enable the TUI next-prompt ghost suggestion (default: true)",
      }),
      batch_tool: Schema.optional(Schema.Boolean).annotate({ description: "Enable the batch tool" }),
      openTelemetry: Schema.optional(Schema.Boolean).annotate({
        description: "Enable OpenTelemetry spans for AI SDK calls (using the 'experimental_telemetry' flag)",
      }),
      primary_tools: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
        description: "Tools that should only be available to primary agents.",
      }),
      continue_loop_on_deny: Schema.optional(Schema.Boolean).annotate({
        description: "Continue the agent loop when a tool call is denied",
      }),
      mcp_timeout: Schema.optional(PositiveInt).annotate({
        description: "Timeout in milliseconds for model context protocol (MCP) requests",
      }),
      policies: Schema.optional(Schema.mutable(Schema.Array(ConfigExperimental.Policy))).annotate({
        description: "Policy statements applied to supported resources, such as provider access",
      }),
    }),
  ),
}).annotate({ identifier: "Config" })

export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>
