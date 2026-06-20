import { createMemo } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "@tui/ui/toast"
import { useProject } from "@tui/context/project"
import { useLanguage } from "@tui/context/language"
import { entries, filter, flatMap, pipe, sortBy } from "remeda"
import type { Agent, AgentConfig } from "@swust-code/sdk/v2"

type ModelValue = {
  providerID: string
  modelID: string
}

function modelToString(model?: ModelValue) {
  if (!model) return undefined
  return `${model.providerID}/${model.modelID}`
}

function resolveAgentModel(agent: Agent, sync: ReturnType<typeof useSync>): ModelValue | undefined {
  if (agent.model) return agent.model
  if (agent.modelRef) {
    const ref = sync.data.config.model_groups?.[agent.modelRef]
    const value = typeof ref === "string" ? ref : ref?.default
    if (value) {
      const [providerID, ...rest] = value.split("/")
      if (providerID && rest.length) return { providerID, modelID: rest.join("/") }
    }
  }
  const fallback = sync.data.config.model
  if (!fallback) return undefined
  const [providerID, ...rest] = fallback.split("/")
  if (!providerID || !rest.length) return undefined
  return { providerID, modelID: rest.join("/") }
}

function describeAgent(agent: Agent, sync: ReturnType<typeof useSync>) {
  const model = modelToString(resolveAgentModel(agent, sync)) ?? agent.modelRef ?? "default"
  const variant = agent.variant ?? "default"
  const steps = agent.steps ? String(agent.steps) : "default"
  return `${model} · ${variant} · steps ${steps}`
}

function variantsFor(model: ModelValue | undefined, sync: ReturnType<typeof useSync>) {
  if (!model) return []
  const provider = sync.data.provider.find((item) => item.id === model.providerID)
  const info = provider?.models[model.modelID]
  if (!info?.variants) return []
  return Object.keys(info.variants)
}

async function saveAgentPatch(input: {
  agent: Agent
  patch: AgentConfig
  dialog: ReturnType<typeof useDialog>
  project: ReturnType<typeof useProject>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ReturnType<typeof useToast>
  t: ReturnType<typeof useLanguage>["t"]
}) {
  const result = await input.sdk.client.config.update({
    workspace: input.project.workspace.current(),
    config: {
      agent: {
        [input.agent.name]: input.patch,
      },
    },
  })
  if (result.error) {
    input.toast.show({ variant: "error", message: JSON.stringify(result.error) })
    return
  }
  await input.sdk.client.instance.dispose()
  await input.sync.bootstrap()
  input.toast.show({ variant: "success", message: input.t("tui.dialog.subagent.saved") })
  input.dialog.replace(() => <DialogSubagentSettings agentName={input.agent.name} />)
}

function DialogSubagentModel(props: { agent: Agent }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const project = useProject()
  const t = useLanguage().t

  const current = createMemo(() => resolveAgentModel(props.agent, sync))
  const options = createMemo(() =>
    pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          sortBy(([model, info]) => info.name ?? model),
          flatMap(([model, info]) => [
            {
              value: { providerID: provider.id, modelID: model },
              title: info.name ?? model,
              description: provider.name,
              category: provider.name,
              onSelect: () => {
                void saveAgentPatch({
                  agent: props.agent,
                  patch: { model: `${provider.id}/${model}` },
                  dialog,
                  project,
                  sdk,
                  sync,
                  toast,
                  t,
                })
              },
            },
          ]),
        ),
      ),
    ),
  )

  return (
    <DialogSelect<ModelValue>
      title={t("tui.dialog.subagent.model.title")}
      options={options()}
      current={current()}
      flat={true}
    />
  )
}

function DialogSubagentVariant(props: { agent: Agent }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const project = useProject()
  const t = useLanguage().t

  const model = createMemo(() => resolveAgentModel(props.agent, sync))
  const variants = createMemo(() => variantsFor(model(), sync))
  const options = createMemo(() => [
    {
      value: "default",
      title: t("tui.dialog.subagent.default"),
      onSelect: () => {
        void saveAgentPatch({
          agent: props.agent,
          patch: { variant: null as any },
          dialog,
          project,
          sdk,
          sync,
          toast,
          t,
        })
      },
    },
    ...variants().map((variant) => ({
      value: variant,
      title: variant,
      onSelect: () => {
        void saveAgentPatch({
          agent: props.agent,
          patch: { variant },
          dialog,
          project,
          sdk,
          sync,
          toast,
          t,
        })
      },
    })),
  ])

  if (variants().length === 0) {
    return (
      <DialogSelect
        title={t("tui.dialog.subagent.variant.title")}
        options={[
          {
            value: "empty",
            title: t("tui.dialog.subagent.variant.none"),
            onSelect: () => dialog.replace(() => <DialogSubagentSettings agentName={props.agent.name} />),
          },
        ]}
        skipFilter={true}
      />
    )
  }

  return (
    <DialogSelect<string>
      title={t("tui.dialog.subagent.variant.title")}
      options={options()}
      current={props.agent.variant ?? "default"}
      flat={true}
    />
  )
}

function DialogSubagentDetail(props: { agent: Agent }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const project = useProject()
  const t = useLanguage().t

  const model = createMemo(() => modelToString(resolveAgentModel(props.agent, sync)) ?? t("tui.dialog.subagent.default"))
  const variant = createMemo(() => props.agent.variant ?? t("tui.dialog.subagent.default"))
  const steps = createMemo(() => (props.agent.steps ? String(props.agent.steps) : t("tui.dialog.subagent.default")))

  async function setSteps() {
    const value = await DialogPrompt.show(dialog, t("tui.dialog.subagent.steps.title"), {
      placeholder: t("tui.dialog.subagent.steps.placeholder"),
      value: props.agent.steps ? String(props.agent.steps) : "",
    })
    if (value === null) return
    const trimmed = value.trim()
    if (!trimmed) {
      await saveAgentPatch({ agent: props.agent, patch: { steps: null as any }, dialog, project, sdk, sync, toast, t })
      return
    }
    const steps = Number(trimmed)
    if (!Number.isInteger(steps) || steps <= 0) {
      toast.show({ variant: "error", message: t("tui.dialog.subagent.steps.invalid") })
      dialog.replace(() => <DialogSubagentDetail agent={props.agent} />)
      return
    }
    await saveAgentPatch({ agent: props.agent, patch: { steps }, dialog, project, sdk, sync, toast, t })
  }

  return (
    <DialogSelect<string>
      title={`${t("tui.dialog.subagent.detail.title")}: ${props.agent.name}`}
      current={undefined}
      options={[
        {
          value: "model",
          title: t("tui.dialog.subagent.model"),
          description: model(),
          onSelect: () => dialog.replace(() => <DialogSubagentModel agent={props.agent} />),
        },
        {
          value: "variant",
          title: t("tui.dialog.subagent.variant"),
          description: variant(),
          onSelect: () => dialog.replace(() => <DialogSubagentVariant agent={props.agent} />),
        },
        {
          value: "steps",
          title: t("tui.dialog.subagent.steps"),
          description: steps(),
          onSelect: () => {
            void setSteps()
          },
        },
        {
          value: "clear",
          title: t("tui.dialog.subagent.clear"),
          onSelect: () => {
            void saveAgentPatch({
              agent: props.agent,
              patch: { model: null as any, variant: null as any, steps: null as any },
              dialog,
              project,
              sdk,
              sync,
              toast,
              t,
            })
          },
        },
      ]}
      skipFilter={true}
    />
  )
}

export function DialogSubagentSettings(props: { agentName?: string }) {
  const sync = useSync()
  const dialog = useDialog()
  const t = useLanguage().t

  const agents = createMemo(() => sync.data.agent.filter((agent) => agent.mode === "subagent" && !agent.hidden))
  const selected = createMemo(() => props.agentName ? agents().find((agent) => agent.name === props.agentName) : undefined)

  if (selected()) return <DialogSubagentDetail agent={selected()!} />

  const options = createMemo(() =>
    agents().map((agent) => ({
      value: agent.name,
      title: agent.name,
      description: describeAgent(agent, sync),
      onSelect: () => dialog.replace(() => <DialogSubagentSettings agentName={agent.name} />),
    })),
  )

  return (
    <DialogSelect<string>
      title={t("tui.dialog.subagent.title")}
      options={
        options().length > 0
          ? options()
          : [
              {
                value: "empty",
                title: t("tui.dialog.subagent.empty"),
                onSelect: () => dialog.clear(),
              },
            ]
      }
      flat={true}
    />
  )
}
