// Headless listener for the agent_takeover tool's in-app handover. The
// server-side tool (packages/opencode/src/tool/agent-local.ts) publishes an
// athena.agent.takeover event on the global bus; the TUI attached to the
// requesting session suspends itself and execs the spawned agent's native
// resume command in this terminal — the same path as picking the session in
// /find-sessions. Athena repaints when the user exits the agent.
import { useRenderer } from "@opentui/solid"
import { onCleanup, onMount } from "solid-js"
import { useEvent } from "../context/event"
import { useRoute } from "../context/route"
import { useToast } from "../ui/toast"
import { execResume } from "../util/athena-sessions"

const TAKEOVER_EVENT = "athena.agent.takeover"

type TakeoverProperties = {
  agent?: string
  sessionId?: string
  workspace?: string
  // Athena session the user asked from; identifies which TUI should swap.
  requestSessionID?: string
}

export function AthenaAgentTakeover() {
  const event = useEvent()
  const route = useRoute()
  const renderer = useRenderer()
  const toast = useToast()

  onMount(() => {
    const unsubscribe = event.subscribe((evt) => {
      const raw = evt as unknown as { type?: string; properties?: TakeoverProperties }
      if (raw.type !== TAKEOVER_EVENT) return
      const props = raw.properties
      if (!props?.agent || !props.sessionId) return
      // Only the TUI currently showing the requesting session takes over.
      if (route.data.type !== "session" || route.data.sessionID !== props.requestSessionID) return
      execResume({ agent: props.agent, sessionId: props.sessionId, workspace: props.workspace ?? "" }, renderer, toast)
    })
    onCleanup(unsubscribe)
  })

  return null
}
