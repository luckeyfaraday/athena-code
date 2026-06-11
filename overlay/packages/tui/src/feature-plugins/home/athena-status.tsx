// Athena Code footer additions: the brand/mode label and, in immersive mode,
// the live memory status line. Reads the status file written by the server's
// memory layer (status.json is duplicated here rather than imported because
// the tui package cannot depend on the opencode package's memory modules).
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTuiPaths } from "../../context/runtime"
import { athenaImmersive, athenaModeLabel, athenaRuntimeBrand } from "../../branding"

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
  return `loaded ${status.loaded ?? 0} memories · recalled ${status.recalled ?? 0} this turn`
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

  return (
    <Show when={athenaImmersive}>
      <text fg={props.api.theme.current.textMuted}>{label()}</text>
    </Show>
  )
}

export function AthenaFooterStatus(props: { api: TuiPluginApi }) {
  return (
    <>
      <text fg={props.api.theme.current.primary}>
        {athenaRuntimeBrand} · {athenaModeLabel}
      </text>
      <AthenaMemory api={props.api} />
    </>
  )
}
