import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../context/tui-config"
import { InstallationChannel, InstallationVersion } from "@/installation/version"
import { TuiPluginRuntime } from "../../plugin"
import { useLanguage } from "../../context/language"
import os from "os"
import path from "path"

import { getScrollAcceleration } from "../../util/scroll"
import { splitDisplayPath } from "./sidebar-path"

function abbreviateHome(input: string, home: string) {
  if (!home) return input
  const relative = path.relative(home, input)
  if (relative === "") return "~"
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return input
  return "~" + path.sep + relative
}

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const { t } = useLanguage()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspaceStatus = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return "error"
    return project.workspace.status(workspaceID) ?? "error"
  }
  const workspaceLabel = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return "unknown"
    const info = project.workspace.get(workspaceID)
    if (!info) return "unknown"
    return `${info.type}: ${info.name}`
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const hasProvider = createMemo(() =>
    sync.data.provider.some(
      (item) => item.id !== "opencode" || Object.values(item.models).some((model) => model.cost?.input !== 0),
    ),
  )
  const showGettingStarted = createMemo(() => !hasProvider())

  const pathInfo = createMemo(() => {
    const sess = session()
    const home = os.homedir()
    const cwd = process.cwd()
    const dir = sess?.directory || cwd
    const out = abbreviateHome(dir, home)
    return splitDisplayPath(out)
  })

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <TuiPluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <span style={{ fg: workspaceStatus() === "connected" ? theme.success : theme.error }}>●</span>{" "}
                    {workspaceLabel()}
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </TuiPluginRuntime.Slot>
            <TuiPluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <Show when={showGettingStarted()}>
            <box
              backgroundColor={theme.backgroundElement}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              flexDirection="row"
              gap={1}
            >
              <text flexShrink={0} fg={theme.text}>
                ⬖
              </text>
              <box flexGrow={1} gap={1}>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.text}>
                    <b>{t("tui.sidebar.getting_started.title")}</b>
                  </text>
                </box>
                <text fg={theme.textMuted}>{t("tui.sidebar.getting_started.free_models")}</text>
                <text fg={theme.textMuted}>{t("tui.sidebar.getting_started.providers")}</text>
                <box flexDirection="row" gap={1} justifyContent="space-between">
                  <text fg={theme.text}>{t("tui.command.provider.connect.title")}</text>
                  <text fg={theme.textMuted}>/connect</text>
                </box>
              </box>
            </box>
          </Show>
          <text>
            <Show when={pathInfo().parent}>
              <span style={{ fg: theme.textMuted }}>
                {pathInfo().parent}
                {path.sep}
              </span>
            </Show>
            <span style={{ fg: theme.text }}>{pathInfo().name}</span>
          </text>
          <TuiPluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>SWUST </b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </TuiPluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}
