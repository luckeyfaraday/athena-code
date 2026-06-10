// Cross-agent session finder for the /find-sessions command: browses and
// searches the Athena session index (every local Claude Code, Codex, opencode,
// Hermes, and athena-code session), grouped by workspace like the legacy
// Athena TUI. Selecting a session resumes it: athena sessions known to the
// running server open in-app; everything else suspends the renderer and execs
// the owning agent's native resume command in the session's workspace.

import { spawn } from "node:child_process"
import { useRenderer } from "@opentui/solid"
import { createMemo, onMount } from "solid-js"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { createDebouncedSignal } from "../util/signal"
import {
  listRecentSessions,
  resumeCommand,
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
  const [search, setSearch] = createDebouncedSignal("", 150)

  const entries = createMemo(() => {
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
    const command = resumeCommand(entry)
    if (!command) {
      toast.show({ variant: "error", message: `No resume command known for ${entry.agent} sessions` })
      return
    }
    dialog.clear()
    renderer.suspend()
    renderer.currentRenderBuffer.clear()
    const restore = () => {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
    const child = spawn(command.argv[0]!, command.argv.slice(1), {
      cwd: command.cwd,
      stdio: ["inherit", "inherit", "inherit"],
      shell: process.platform === "win32",
    })
    child.on("error", (error) => {
      restore()
      toast.show({
        variant: "error",
        title: `Failed to launch ${entry.agent}`,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    child.on("exit", restore)
  }

  const options = createMemo((): DialogSelectOption<AthenaSessionEntry>[] => {
    const list = entries()
    if (list.length === 0) {
      return [
        {
          title: search().trim()
            ? "No sessions match — try different words"
            : "No indexed sessions yet — the index builds in the background as you use your agents",
          value: undefined as unknown as AthenaSessionEntry,
          disabled: true,
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
  })

  return (
    <DialogSelect
      title="Find sessions across agents"
      options={options()}
      skipFilter={true}
      onFilter={setSearch}
      onSelect={(option) => {
        if (option.value) resume(option.value)
      }}
    />
  )
}
