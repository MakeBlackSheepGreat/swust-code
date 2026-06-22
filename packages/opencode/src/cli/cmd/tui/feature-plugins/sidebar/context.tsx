import type { AssistantMessage } from "@swust-code/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiThemeCurrent } from "@swust-code/plugin/tui"
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useLanguage } from "../../context/language"
import { completedTPS, formatTPS, streamingTPS } from "./tps"

const id = "internal:sidebar-context"
const REFRESH_MS = 1000
const BAR_WIDTH = 13
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
    total: total(left) + total(right),
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
      flexGrow={1}
      backgroundColor={props.theme.backgroundElement}
      border={["left"]}
      borderColor={props.accent}
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={props.theme.textMuted} wrapMode="none">
        {props.label}
      </text>
      <text fg={props.theme.text} wrapMode="word">
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

  const [tick, setTick] = createSignal(Date.now())

  const lastAssistant = createMemo(() => msg().findLast((item): item is AssistantMessage => item.role === "assistant"))

  const isStreaming = createMemo(() => {
    const m = lastAssistant()
    return m !== undefined && !m.time.completed
  })

  createEffect(() => {
    if (!isStreaming()) return
    const handle = setInterval(() => setTick(Date.now()), REFRESH_MS)
    onCleanup(() => clearInterval(handle))
  })

  const tps = createMemo<number | null>(() => {
    const m = lastAssistant()
    if (!m) return null

    if (isStreaming()) {
      tick()
      const parts = props.api.state.part(m.id)
      const combined = parts
        .filter((p) => p.type === "text" || p.type === "reasoning")
        .map((p) => p.text)
        .join("")
      return streamingTPS(combined, m.time.created, Date.now())
    }

    const idleTarget = msg().findLast(
      (item): item is AssistantMessage =>
        item.role === "assistant" &&
        item.time.completed !== undefined &&
        item.tokens.output + item.tokens.reasoning > 0,
    )
    if (!idleTarget || idleTarget.time.completed === undefined) return null
    return completedTPS(
      idleTarget.tokens.output,
      idleTarget.tokens.reasoning,
      idleTarget.time.created,
      idleTarget.time.completed,
    )
  })

  const tpsLabel = createMemo(() => formatTPS(tps()))

  const state = createMemo(() => {
    const assistants = msg().filter(
      (item): item is AssistantMessage => item.role === "assistant" && total(item.tokens) > 0,
    )
    const last = assistants.at(-1)
    const sessionUsage = session() as { tokens?: Tokens; cost?: number } | undefined
    const aggregate = sessionUsage?.tokens ?? assistants.reduce((acc, item) => add(acc, item.tokens), emptyTokens)
    const aggregatePrompt = promptTotal(aggregate)
    const totalCost = sessionUsage?.cost ?? assistants.reduce((sum, item) => sum + item.cost, 0)
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
          <text fg={theme().text}><b>{t("tui.sidebar.context.window.title")}</b></text>
          <text fg={healthColor(state().contextHealth, theme())} wrapMode="none"><b>{t(`tui.sidebar.context.health.${state().contextHealth}`)}</b></text>
        </box>
        <text fg={theme().textMuted}>{t("tui.sidebar.context.window.caption")}</text>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().text}>
            <b>{formatCompactTokens(state().contextTokens)}</b>
            <span style={{ fg: theme().textMuted }}> / {formatOptionalTokens(state().limit)} {t("tui.sidebar.context.tokens")}</span>
          </text>
          <text fg={theme().text}><b>{formatPercent(state().percent)}</b></text>
        </box>
        <text fg={healthColor(state().contextHealth, theme())}>{progressBar(state().percent)}</text>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().primary} wrapMode="none">{t("tui.sidebar.context.breakdown.prompt")} <b>{formatCompactTokens(promptTotal(state().latest))}</b></text>
          <text fg={theme().secondary} wrapMode="none">{t("tui.sidebar.context.breakdown.completion")} <b>{formatCompactTokens(state().latest.output)}</b></text>
        </box>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().warning} wrapMode="none">{t("tui.sidebar.context.breakdown.reasoning")} <b>{formatCompactTokens(state().latest.reasoning)}</b></text>
          <text fg={theme().textMuted} wrapMode="none">{t("tui.sidebar.context.breakdown.other")} <b>{formatCompactTokens(state().otherTokens)}</b></text>
        </box>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().text} wrapMode="none">{t("tui.sidebar.context.breakdown.total")} <b>{formatCompactTokens(state().contextTokens)} / {formatOptionalTokens(state().limit)}</b></text>
          <text fg={theme().info} wrapMode="none">{t("tui.sidebar.context.metric.remaining")} <b>{formatOptionalTokens(state().remainingTokens)}</b></text>
        </box>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().primary} wrapMode="none">{t("tui.sidebar.context.metric.session_tokens")} <b>{formatCompactTokens(total(state().aggregate))}</b></text>
        </box>
      </box>
      <box gap={1} paddingBottom={1} border={["bottom"]} borderColor={theme().borderSubtle}>
        <text fg={theme().text}><b>{t("tui.sidebar.context.runtime.title")}</b></text>
        <box flexDirection="row" gap={1}>
          <MetricTile theme={theme()} label={t("tui.sidebar.context.metric.requests")} value={formatTokens(state().requestCount)} accent={theme().secondary} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.metric.duration")} value={formatDuration(state().elapsedMs, t)} accent={theme().success} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.metric.tps")} value={tpsLabel() ?? "-"} accent={theme().info} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.metric.turn_tokens")} value={formatCompactTokens(state().totalTokens)} accent={theme().info} />
        </box>
      </box>
      <box gap={1} paddingBottom={1} border={["bottom"]} borderColor={theme().borderSubtle}>
        <text fg={theme().text}><b>{t("tui.sidebar.context.cost.title")}</b></text>
        <box flexDirection="row" gap={1}>
          <MetricTile theme={theme()} label={t("tui.sidebar.context.cost.turn_hit")} value={formatRate(state().latestCacheRate)} accent={theme().success} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.cost.avg_hit")} value={formatRate(state().averageCacheRate)} accent={theme().info} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.cost.turn_cost")} value={money.format(state().turnCost)} accent={theme().secondary} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.cost.session_cost")} value={money.format(state().totalCost)} accent={theme().primary} />
        </box>
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <text fg={theme().success} wrapMode="none">{t("tui.sidebar.context.cache.read")} <b>{formatTokens(state().aggregate.cache.read)}</b></text>
          <text fg={theme().info} wrapMode="none">{t("tui.sidebar.context.cache.write")} <b>{formatTokens(state().aggregate.cache.write)}</b></text>
        </box>
      </box>
      <box gap={1}>
        <text fg={theme().text}><b>{t("tui.sidebar.context.status.title")}</b></text>
        <box flexDirection="row" gap={1}>
          <MetricTile theme={theme()} label={t("tui.sidebar.context.status.model")} value={state().modelLabel} accent={theme().primary} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.status.context")} value={t(`tui.sidebar.context.health.${state().contextHealth}`)} accent={healthColor(state().contextHealth, theme())} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.status.compaction")} value={t(`tui.sidebar.context.compaction.${state().compaction}`)} accent={compactionColor(state().compaction, theme())} />
          <MetricTile theme={theme()} label={t("tui.sidebar.context.status.compact_trigger")} value={formatPercent(state().compactTrigger)} accent={theme().warning} />
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

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
