// Athena Code home footer — registered on the home_footer slot at order 50,
// which wins single_winner over the upstream footer (order 100). It must
// therefore carry everything the upstream footer showed (directory/branch,
// MCP status, version) plus the Athena additions: the brand and the live
// memory status line. The memory status reads the file written by the
// server's memory layer (duplicated here rather than imported because the
// tui package cannot depend on the opencode package's memory modules).

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createMemo, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { abbreviateHome } from "../../runtime"
import { useTuiPaths } from "../../context/runtime"
import { useHomeSessionDestination } from "../../routes/home/session-destination"
import { athenaRuntimeBrand } from "../../branding"

type MemoryStatus = {
  loaded?: number
  recalled?: number
  empty_store?: boolean
}

function readMemoryStatus(directory: string): MemoryStatus | null {
  const file = join(directory, ".context-workspace", "memory", "status.json")
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MemoryStatus
  } catch {
    return null
  }
}

function formatMemoryStatus(status: MemoryStatus | null): string {
  if (!status || status.empty_store) return "memory empty"
  return `${status.loaded ?? 0} threads held · ${status.recalled ?? 0} recalled`
}

function AthenaMemory(props: { api: TuiPluginApi }) {
  const paths = useTuiPaths()
  const directory = createMemo(() => props.api.state.path.directory || paths.cwd)
  const [label, setLabel] = createSignal(formatMemoryStatus(readMemoryStatus(directory())))

  onMount(() => {
    const refresh = () => setLabel(formatMemoryStatus(readMemoryStatus(directory())))
    refresh()
    const timer = setInterval(refresh, 1000)
    onCleanup(() => clearInterval(timer))
  })

  return <text fg={props.api.theme.current.textMuted}>{label()}</text>
}

// Directory, Mcp, and Version mirror the upstream home footer
// (feature-plugins/home/footer.tsx) so taking the slot loses nothing.
function Directory(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const destination = useHomeSessionDestination()
  const paths = useTuiPaths()
  const dir = createMemo(() => {
    const selected = destination?.destination()
    if (!selected || selected.type === "new") return
    const out = abbreviateHome(selected.directory, paths.home)
    const branch =
      selected.directory === (props.api.state.path.directory || paths.cwd) ? props.api.state.vcs?.branch : undefined
    if (branch) return out + ":" + branch
    return out
  })

  return <Show when={dir()}>{(value) => <text fg={theme().textMuted}>{value()}</text>}</Show>
}

function Mcp(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const has = createMemo(() => list().length > 0)
  const err = createMemo(() => list().some((item) => item.status === "failed"))
  const count = createMemo(() => list().filter((item) => item.status === "connected").length)

  return (
    <Show when={has()}>
      <box gap={1} flexDirection="row" flexShrink={0}>
        <text fg={theme().text}>
          <Switch>
            <Match when={err()}>
              <span style={{ fg: theme().error }}>⊙ </span>
            </Match>
            <Match when={true}>
              <span style={{ fg: count() > 0 ? theme().success : theme().textMuted }}>⊙ </span>
            </Match>
          </Switch>
          {count()} MCP
        </text>
        <text fg={theme().textMuted}>/status</text>
      </box>
    </Show>
  )
}

function Version(props: { api: TuiPluginApi }) {
  return (
    <box flexShrink={0}>
      <text fg={props.api.theme.current.textMuted}>{props.api.app.version}</text>
    </box>
  )
}

export function AthenaHomeFooter(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  return (
    <box
      width="100%"
      border={["top"]}
      borderColor={theme().borderSubtle}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      flexShrink={0}
      gap={2}
    >
      <text fg={theme().primary}>{athenaRuntimeBrand}</text>
      <Directory api={props.api} />
      <Mcp api={props.api} />
      <box flexGrow={1} />
      <AthenaMemory api={props.api} />
      <Version api={props.api} />
    </box>
  )
}
