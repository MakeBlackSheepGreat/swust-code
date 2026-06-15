import type { AssistantMessage } from "@swust-code/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiThemeCurrent } from "@swust-code/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo } from "solid-js"
import { useLanguage } from "../../context/language"

const id = "internal:sidebar-context"
const BAR_WIDTH = 16
const TILE_WIDTH = 17
const COMPACT_TRIGGER_PERCENT = 90

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

type Tokens = AssistantMessage["tokens"]
type ContextHealth = "empty" | "good" | "busy" | "high" | "full"
type CompactionState = "idle" | "soon" | "needed" | "unknown"

const emptyTokens: Tokens = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
}

function total(tokens: Tokens) {
  const calculated = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
  return Math.max(tokens.total ?? calculated, calculated)
}

function promptTotal(tokens: Tokens) {
  return tokens.input + tokens.cache.read + tokens.cache.write
}

function otherTotal(tokens: Tokens) {
  return Math.max(0, total(tokens) - promptTotal(tokens) - tokens.output - tokens.reasoning)
}

function add(left: Tokens, right: Tokens): Tokens {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    reasoning: left.reasoning + right.reasoning,
    cache: {
      read: left.cache.read + right.cache.read,
      write: left.cache.write + right.cache.write,
    },
  }
}

function formatTokens(value: number) {
  return Math.round(value).toLocaleString()
}

function formatCompactTokens(value: number) {
  const rounded = Math.round(value)
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toFixed(rounded >= 10_000_000 ? 0 : 1)}M`
  if (rounded >= 10_000) return `${Math.round(rounded / 1_000)}K`
  if (rounded >= 1_000) return `${(rounded / 1_000).toFixed(1)}K`
  return rounded.toLocaleString()
}

function formatOptionalTokens(value: number | null) {
  return value === null ? "-" : formatTokens(value)
}

function formatShortText(value: string) {
  return value.length > 13 ? `${value.slice(0, 10)}...` : value
}

function rate(hit: number, denominator: number) {
  if (denominator <= 0) return null
  return (hit / denominator) * 100
}

function formatRate(value: number | null) {
  if (value === null) return "-"
  return `${value.toFixed(2)}%`
}

function formatPercent(value: number | null) {
  if (value === null) return "-"
  return `${value}%`
}

function progressBar(percent: number | null) {
  if (percent === null) return `[${"-".repeat(BAR_WIDTH)}]`
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)))
  return `[${"#".repeat(filled)}${"-".repeat(BAR_WIDTH - filled)}]`
}

function formatDuration(
  milliseconds: number,
  t: (key: string, values?: Record<string, string | number | boolean>) => string,
) {
  if (milliseconds <= 0) return "-"
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const separator = t("tui.sidebar.context.duration.separator")
  const parts: string[] = []
  if (hours > 0) parts.push(t("tui.sidebar.context.duration.hour", { count: hours }))
  if (minutes > 0 || hours > 0) parts.push(t("tui.sidebar.context.duration.minute", { count: minutes }))
  if (hours === 0) parts.push(t("tui.sidebar.context.duration.second", { count: seconds }))
  return parts.join(separator)
}

function health(percent: number | null, contextTokens: number): ContextHealth {
  if (contextTokens <= 0) return "empty"
  if (percent === null || percent < 50) return "good"
  if (percent < 75) return "busy"
  if (percent < 90) return "high"
  return "full"
}

function compactionState(percent: number | null, contextTokens: number): CompactionState {
  if (contextTokens <= 0) return "unknown"
  if (percent === null || percent < 75) return "idle"
  if (percent < 90) return "soon"
  return "needed"
}

function healthColor(status: ContextHealth, theme: TuiThemeCurrent) {
  switch (status) {
    case "empty":
      return theme.textMuted
    case "good":
      return theme.success
    case "busy":
      return theme.info
    case "high":
      return theme.warning
    case "full":
      return theme.error
  }
}

function compactionColor(status: CompactionState, theme: TuiThemeCurrent) {
  switch (status) {
    case "idle":
      return theme.success
    case "soon":
      return theme.warning
    case "needed":
      return theme.error
    case "unknown":
      return theme.textMuted
  }
}

function MetricTile(props: { theme: TuiThemeCurrent; label: string; value: string; accent: TuiThemeCurrent["primary"] }) {
  return (
    <box
      width={TILE_WIDTH}
      minHeight={4}
      backgroundColor={props.theme.backgroundElement}
      border={["left"]}
      borderColor={props.accent}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={props.theme.textMuted} wrapMode="none">
        {props.label}
      </text>
      <text fg={props.theme.text} wrapMode="none">
        <b>{props.value}</b>
      </text>
    </box>
  )
}

function DetailRow(props: { theme: TuiThemeCurrent; label: string; value: string; accent?: TuiThemeCurrent["primary"] }) {
  return (
    <box flexDirection="row" justifyContent="space-between" gap={1}>
      <text fg={props.accent ?? props.theme.textMuted} wrapMode="none">
        {props.label}
      </text>
      <text fg={props.theme.text} wrapMode="none">
        <b>{props.value}</b>
      </text>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const { t } = useLanguage()
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))

  const state = createMemo(() => {
    const assistants = msg().filter(
      (item): item is AssistantMessage => item.role === "assistant" && total(item.tokens) > 0,
    )
    const last = assistants.at(-1)
    const aggregate = session()?.tokens ?? assistants.reduce((acc, item) => add(acc, item.tokens), emptyTokens)
    const aggregatePrompt = promptTotal(aggregate)
    const totalCost = session()?.cost ?? assistants.reduce((sum, item) => sum + item.cost, 0)
    const elapsedMs = assistants.reduce((sum, item) => {
      if (!item.time.created) return sum
      const completed = item.time.completed ?? Date.now()
      return sum + Math.max(0, completed - item.time.created)
    }, 0)
    if (!last) {
      const contextHealth = health(null, 0)
      return {
        contextTokens: 0,
        totalTokens: 0,
        limit: null,
        percent: null,
        latest: emptyTokens,
        otherTokens: 0,
        aggregate,
        latestCacheRate: null,
        averageCacheRate: rate(aggregate.cache.read, aggregatePrompt),
        requestCount: 0,
        totalCost,
        turnCost: 0,
        elapsedMs,
        remainingTokens: null,
        compactTrigger: null,
        modelLabel: "-",
        contextHealth,
        compaction: compactionState(null, 0),
      }
    }

    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const contextTokens = total(last.tokens)
    const limit = model?.limit.context ?? null
    const percent = limit ? Math.min(100, Math.round((contextTokens / limit) * 100)) : null
    return {
      contextTokens,
      totalTokens: total(last.tokens),
      limit,
      percent,
      latest: last.tokens,
      otherTokens: otherTotal(last.tokens),
      aggregate,
      latestCacheRate: rate(last.tokens.cache.read, promptTotal(last.tokens)),
      averageCacheRate: rate(aggregate.cache.read, aggregatePrompt),
      requestCount: assistants.length,
      totalCost,
      turnCost: last.cost,
      elapsedMs,
      remainingTokens: limit ? Math.max(0, limit - contextTokens) : null,
      compactTrigger: limit ? COMPACT_TRIGGER_PERCENT : null,
      modelLabel: last.modelID,
      contextHealth: health(percent, contextTokens),
      compaction: compactionState(percent, contextTokens),
    }
  })

  return (
    <box gap={1}>
      <box gap={1} paddingBottom={1} border={["bottom"]} borderColor={theme().borderSubtle}>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().text}>
            <b>{t("tui.sidebar.context.window.title")}</b>
          </text>
          <text fg={healthColor(state().contextHealth, theme())} wrapMode="none">
            <b>{t(`tui.sidebar.context.health.${state().contextHealth}`)}</b>
          </text>
        </box>
        <text fg={theme().textMuted}>{t("tui.sidebar.context.window.caption")}</text>
        <text fg={theme().text}>
          <b>{formatTokens(state().contextTokens)}</b>
          <span style={{ fg: theme().textMuted }}>
            {" "}
            / {formatOptionalTokens(state().limit)} {t("tui.sidebar.context.tokens")}
          </span>
        </text>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={healthColor(state().contextHealth, theme())}>{progressBar(state().percent)}</text>
          <text fg={theme().text}>
            <b>{formatPercent(state().percent)}</b>
          </text>
        </box>
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.breakdown.prompt")}
          value={formatTokens(promptTotal(state().latest))}
          accent={theme().primary}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.breakdown.completion")}
          value={formatTokens(state().latest.output)}
          accent={theme().secondary}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.breakdown.reasoning")}
          value={formatTokens(state().latest.reasoning)}
          accent={theme().warning}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.breakdown.other")}
          value={formatTokens(state().otherTokens)}
          accent={theme().textMuted}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.breakdown.total")}
          value={`${formatTokens(state().contextTokens)} / ${formatOptionalTokens(state().limit)}`}
          accent={theme().text}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.metric.remaining")}
          value={formatOptionalTokens(state().remainingTokens)}
          accent={theme().info}
        />
      </box>

      <box gap={1} paddingBottom={1} border={["bottom"]} borderColor={theme().borderSubtle}>
        <text fg={theme().text}>
          <b>{t("tui.sidebar.context.runtime.title")}</b>
        </text>
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.metric.session_tokens")}
            value={formatCompactTokens(total(state().aggregate))}
            accent={theme().primary}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.metric.requests")}
            value={formatTokens(state().requestCount)}
            accent={theme().secondary}
          />
        </box>
        <MetricTile
          theme={theme()}
          label={t("tui.sidebar.context.metric.duration")}
          value={formatDuration(state().elapsedMs, t)}
          accent={theme().success}
        />
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.metric.turn_tokens")}
            value={formatCompactTokens(state().totalTokens)}
            accent={theme().info}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.metric.prompt_tokens")}
            value={formatCompactTokens(promptTotal(state().latest))}
            accent={theme().warning}
          />
        </box>
      </box>

      <box gap={1} paddingBottom={1} border={["bottom"]} borderColor={theme().borderSubtle}>
        <text fg={theme().text}>
          <b>{t("tui.sidebar.context.cost.title")}</b>
        </text>
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.cost.turn_hit")}
            value={formatRate(state().latestCacheRate)}
            accent={theme().success}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.cost.avg_hit")}
            value={formatRate(state().averageCacheRate)}
            accent={theme().info}
          />
        </box>
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.cost.turn_cost")}
            value={money.format(state().turnCost)}
            accent={theme().secondary}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.cost.session_cost")}
            value={money.format(state().totalCost)}
            accent={theme().primary}
          />
        </box>
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.cache.read")}
          value={formatTokens(state().aggregate.cache.read)}
          accent={theme().success}
        />
        <DetailRow
          theme={theme()}
          label={t("tui.sidebar.context.cache.write")}
          value={formatTokens(state().aggregate.cache.write)}
          accent={theme().info}
        />
      </box>

      <box gap={1}>
        <text fg={theme().text}>
          <b>{t("tui.sidebar.context.status.title")}</b>
        </text>
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.status.model")}
            value={formatShortText(state().modelLabel)}
            accent={theme().primary}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.status.context")}
            value={t(`tui.sidebar.context.health.${state().contextHealth}`)}
            accent={healthColor(state().contextHealth, theme())}
          />
        </box>
        <box flexDirection="row" gap={1}>
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.status.compaction")}
            value={t(`tui.sidebar.context.compaction.${state().compaction}`)}
            accent={compactionColor(state().compaction, theme())}
          />
          <MetricTile
            theme={theme()}
            label={t("tui.sidebar.context.status.compact_trigger")}
            value={formatPercent(state().compactTrigger)}
            accent={theme().warning}
          />
        </box>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
