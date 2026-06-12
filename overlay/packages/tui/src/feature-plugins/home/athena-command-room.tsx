// The command room — the home screen's identity block under the prompt
// (docs/ui-identity-design.md): a few lines of true numbers, the owl, and
// the day's maxim. Every data line is real (cross-agent session index, git
// branch); lines without data are omitted rather than rendered as zeros.
// The memory status line is NOT repeated here — it already lives in the
// home footer (athena-status.tsx).

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiPaths } from "../../context/runtime"
import { AthenaGrandOwl, AthenaOwl } from "../../component/athena-owl"
import { archiveStats, type ArchiveStats } from "../../util/athena-sessions"
import { dailyAphorism } from "../../util/athena-identity"

const STATS_REFRESH_MS = 30_000

// Terminal rows needed before the grand owl joins the command room without
// pushing the prompt or footer off screen (hero + prompt + rows + footer).
const GRAND_OWL_MIN_ROWS = 42

function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

export function AthenaCommandRoom(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const paths = useTuiPaths()
  const dimensions = useTerminalDimensions()
  const grand = createMemo(() => dimensions().height >= GRAND_OWL_MIN_ROWS)
  const directory = createMemo(() => props.api.state.path.directory || paths.cwd)

  const [stats, setStats] = createSignal<ArchiveStats | null>(null)
  onMount(() => {
    const refresh = () => setStats(archiveStats(directory()))
    refresh()
    const timer = setInterval(refresh, STATS_REFRESH_MS)
    timer.unref?.()
    onCleanup(() => clearInterval(timer))
  })

  const rows = createMemo(() => {
    const out: Array<{ label: string; value: string }> = []
    const archive = stats()
    if (archive && archive.sessions > 0) {
      out.push({
        label: "the archive",
        value: `${formatCount(archive.sessions)} sessions across ${archive.agents} ${
          archive.agents === 1 ? "agent" : "agents"
        }`,
      })
    }
    const branch = props.api.state.vcs?.branch
    if (branch) {
      const here = archive?.workspaceSessions ?? 0
      out.push({
        label: "this campaign",
        value: here > 0 ? `${branch} · ${formatCount(here)} sessions from this repo` : branch,
      })
    }
    return out
  })
  const labelWidth = createMemo(() => Math.max(...rows().map((row) => row.label.length), 0))
  const maxim = dailyAphorism()

  return (
    <box width="100%" alignItems="center" paddingTop={2} flexShrink={1}>
      <box flexDirection="column" gap={0}>
        <For each={rows()}>
          {(row) => (
            <text wrapMode="none">
              <span style={{ fg: theme().textMuted }}>{row.label.padEnd(labelWidth() + 3)}</span>
              <span style={{ fg: theme().text }}>{row.value}</span>
            </text>
          )}
        </For>
        <Show when={rows().length > 0}>
          <text> </text>
        </Show>
        <Show
          when={grand()}
          fallback={
            <box flexDirection="row" gap={2} alignItems="center">
              <AthenaOwl state={() => "idle"} color={theme().textMuted} faceColor={theme().text} />
              <text fg={theme().textMuted} wrapMode="none">
                “{maxim.text}” — {maxim.source}
              </text>
            </box>
          }
        >
          <box flexDirection="column" alignItems="center" gap={1}>
            <AthenaGrandOwl color={theme().textMuted} faceColor={theme().text} />
            <text fg={theme().textMuted} wrapMode="none">
              “{maxim.text}” — {maxim.source}
            </text>
          </box>
        </Show>
      </box>
    </box>
  )
}
