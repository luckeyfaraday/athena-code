// Cross-agent session finder for the /find-sessions command: browses and
// searches the Athena session index (every local Claude Code, Codex, opencode,
// Hermes, and athena-code session), grouped by workspace like the legacy
// Athena TUI. Selecting a session resumes it: athena sessions known to the
// running server open in-app; everything else suspends the renderer and execs
// the owning agent's native resume command in the session's workspace.

import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import {
  execResume,
  listRecentSessions,
  refreshSessionIndex,
  searchSessions,
  type AthenaSessionEntry,
} from "../util/athena-sessions"

const BROWSE_LIMIT = 100
const SEARCH_LIMIT = 50

function workspaceLabel(workspace: string): string {
  if (!workspace) return "(no workspace)"
  const tail = workspace.replace(/[\\/]+$/, "").split(/[\\/]/).pop()
  return tail || workspace
}

function timeLabel(updated: string | null): string {
  if (!updated) return ""
  return updated.slice(0, 16).replace("T", " ")
}

export function DialogAthenaSessions() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const toast = useToast()
  const renderer = useRenderer()
  // Debounced by hand instead of via util/signal's createDebouncedSignal:
  // that helper's @solid-primitives/scheduled debounce is a silent no-op in
  // compiled binaries, where the build's conditions:["node"] resolves
  // solid-js/web to its server bundle and isServer is permanently true.
  const [search, setSearchNow] = createSignal("")
  const [refreshing, setRefreshing] = createSignal(false)
  const [refreshVersion, setRefreshVersion] = createSignal(0)
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const setSearch = (value: string) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => setSearchNow(value), 150)
  }
  onCleanup(() => clearTimeout(searchTimer))

  const entries = createMemo(() => {
    refreshVersion()
    const query = search().trim()
    return query ? searchSessions(query, SEARCH_LIMIT) : listRecentSessions(BROWSE_LIMIT)
  })

  function resume(entry: AthenaSessionEntry) {
    // Athena shares the running server's session storage; if the server knows
    // this session, switching routes beats spawning a nested TUI.
    if (entry.agent === "athena" && sync.data.session.some((session) => session.id === entry.sessionId)) {
      route.navigate({ type: "session", sessionID: entry.sessionId })
      dialog.clear()
      return
    }
    dialog.clear()
    execResume(entry, renderer, toast)
  }

  const options = createMemo((): DialogSelectOption<AthenaSessionEntry>[] => {
    const list = entries()
    if (list.length === 0) {
      // Not `disabled`: DialogSelect strips disabled options when skipFilter
      // is set, which would leave the dialog silently empty. Selecting this
      // row is a no-op because its value is undefined.
      return [
        {
          title: search().trim()
            ? "No sessions match — try different words"
            : "No indexed sessions yet — the index builds in the background as you use your agents",
          value: undefined as unknown as AthenaSessionEntry,
        },
      ]
    }
    return list.map((entry) => ({
      title: (search().trim() && entry.snippet) || entry.title || entry.sessionId,
      value: entry,
      category: workspaceLabel(entry.workspace),
      footer: [entry.agent, timeLabel(entry.updated)].filter(Boolean).join(" · "),
    }))
  })

  onMount(() => {
    dialog.setSize("large")
    setRefreshing(true)
    refreshSessionIndex()
      .then((started) => {
        if (started) setRefreshVersion((version) => version + 1)
      })
      .finally(() => setRefreshing(false))
  })

  return (
    <DialogSelect
      title={refreshing() ? "Find sessions across agents · updating index" : "Find sessions across agents"}
      options={options()}
      skipFilter={true}
      onFilter={setSearch}
      onSelect={(option) => {
        if (option.value) resume(option.value)
      }}
    />
  )
}
