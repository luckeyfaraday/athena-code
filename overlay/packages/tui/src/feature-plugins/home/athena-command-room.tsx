// The command room — the home screen's identity block under the prompt:
// a few lines of true numbers and the day's
// maxim. Every data line is real (cross-agent session index, git branch);
// lines without data are omitted rather than rendered as zeros. The owl lives
// in the masthead above the prompt (athena-home-hero.tsx), and the memory
// status line in the home footer (athena-status.tsx) — neither repeats here.

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTuiPaths } from "../../context/runtime"
import { archiveStats, type ArchiveStats } from "../../util/athena-sessions"
import { dailyAphorism } from "../../util/athena-identity"

const STATS_REFRESH_MS = 30_000
// Padding budget for the centered maxim. Anything that would touch the edge
// is dropped: the renderer smears overflow into the live characters in narrow
// terminals (the centered text gets clipped on both sides at once), so the
// "omit rather than render badly" rule that applies to the data lines below
// is extended to the maxim.
const MAXIM_SIDE_PADDING = 4

function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

export function AthenaCommandRoom(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const paths = useTuiPaths()
  const directory = createMemo(() => props.api.state.path.directory || paths.cwd)
  const dimensions = useTerminalDimensions()

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
  const maxim = createMemo(() => dailyAphorism())
  // Smart quotes + " — " separator add 5 cells around the text and source.
  const maximWidth = createMemo(() => maxim().text.length + maxim().source.length + 5)
  const maximFits = createMemo(() => dimensions().width >= maximWidth() + MAXIM_SIDE_PADDING)

  return (
    <box width="100%" alignItems="center" paddingTop={2} flexShrink={1}>
      <box flexDirection="column" alignItems="center" gap={0}>
        <box flexDirection="column">
          <For each={rows()}>
            {(row) => (
              <text wrapMode="none">
                <span style={{ fg: theme().textMuted }}>{row.label.padEnd(labelWidth() + 3)}</span>
                <span style={{ fg: theme().text }}>{row.value}</span>
              </text>
            )}
          </For>
        </box>
        <Show when={maximFits()}>
          <Show when={rows().length > 0}>
            <text> </text>
          </Show>
          <text fg={theme().textMuted} wrapMode="none">
            “{maxim().text}” — {maxim().source}
          </text>
        </Show>
      </box>
    </box>
  )
}
