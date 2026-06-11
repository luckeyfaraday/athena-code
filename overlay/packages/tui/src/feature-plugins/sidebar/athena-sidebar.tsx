// Athena session sidebar identity: takes the sidebar_title and
// sidebar_footer single_winner slots at order 50. The title gains the bronze
// meander rule under it, and the footer's upstream word-pair becomes the
// brand line while preserving the session id, workspace, share url, getting
// started promo, and directory:branch path.

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { createMemo, Show } from "solid-js"
import { abbreviateHome } from "../../runtime"
import { useTuiPaths } from "../../context/runtime"
import { useProject } from "../../context/project"
import { WorkspaceLabel } from "../../component/workspace-label"
import { athenaRuntimeBrand } from "../../branding"

const RULE = "─".repeat(14) + " ◆ " + "─".repeat(14)

export function AthenaSidebarTitle(props: {
  api: TuiPluginApi
  sessionID: string
  title: string
  shareUrl?: string
}) {
  const theme = () => props.api.theme.current
  const project = useProject()
  const session = createMemo(() => props.api.state.session.get(props.sessionID))
  const workspace = createMemo(() => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  })

  return (
    <box paddingRight={1}>
      <text fg={theme().text}>
        <b>{props.title}</b>
      </text>
      <text fg={theme().borderSubtle}>{RULE}</text>
      <Show when={InstallationChannel !== "latest"}>
        <text fg={theme().textMuted}>{props.sessionID}</text>
      </Show>
      <Show when={session()?.workspaceID}>
        <text fg={theme().textMuted}>
          <Show
            when={workspace()}
            fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
          >
            {(item) => (
              <WorkspaceLabel
                type={item().type}
                name={item().name}
                status={project.workspace.status(item().id) ?? "error"}
                icon
              />
            )}
          </Show>
        </text>
      </Show>
      <Show when={props.shareUrl}>
        <text fg={theme().textMuted}>{props.shareUrl}</text>
      </Show>
    </box>
  )
}

export function AthenaSidebarFooter(props: { api: TuiPluginApi; sessionID: string }) {
  const paths = useTuiPaths()
  const theme = () => props.api.theme.current
  const has = createMemo(() =>
    props.api.state.provider.some(
      (item) => item.id !== "opencode" || Object.values(item.models).some((model) => model.cost?.input !== 0),
    ),
  )
  const done = createMemo(() => props.api.kv.get("dismissed_getting_started", false))
  const show = createMemo(() => !has() && !done())
  const path = createMemo(() => {
    const session = props.api.state.session.get(props.sessionID)
    const dir = session?.directory || props.api.state.path.directory || paths.cwd
    const out = abbreviateHome(dir, paths.home)
    const branch = session?.directory === props.api.state.path.directory ? props.api.state.vcs?.branch : undefined
    const text = branch ? out + ":" + branch : out
    const list = text.split("/")
    return {
      parent: list.slice(0, -1).join("/"),
      name: list.at(-1) ?? "",
    }
  })
  const brand = athenaRuntimeBrand.split(" ")

  return (
    <box gap={1}>
      <Show when={show()}>
        <box
          backgroundColor={theme().backgroundElement}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          flexDirection="row"
          gap={1}
        >
          <text flexShrink={0} fg={theme().primary}>
            ◆
          </text>
          <box flexGrow={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme().text}>
                <b>Getting started</b>
              </text>
              <text fg={theme().textMuted} onMouseDown={() => props.api.kv.set("dismissed_getting_started", true)}>
                ✕
              </text>
            </box>
            <text fg={theme().textMuted}>Free starter models are included so you can begin immediately.</text>
            <text fg={theme().textMuted}>
              Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc
            </text>
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().text}>Connect provider</text>
              <text fg={theme().textMuted}>/connect</text>
            </box>
          </box>
        </box>
      </Show>
      <text>
        <span style={{ fg: theme().textMuted }}>{path().parent}/</span>
        <span style={{ fg: theme().text }}>{path().name}</span>
      </text>
      <text fg={theme().textMuted}>
        <span style={{ fg: theme().primary }}>◆</span>{" "}
        <span style={{ fg: theme().primary }}>
          <b>{brand[0]}</b>
        </span>
        <span style={{ fg: theme().text }}>
          <b> {brand.slice(1).join(" ")}</b>
        </span>{" "}
        <span>{props.api.app.version}</span>
      </text>
    </box>
  )
}
