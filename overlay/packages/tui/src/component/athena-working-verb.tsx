// The working verb — one muted word at the right of the session prompt while
// a turn is running. The upstream spinner
// already animates; this adds the voice. Rotates slowly so a long turn reads
// as alive, seeded per session so parallel panes don't move in lockstep.

import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { verbSeed, workingVerb } from "../util/athena-identity"

const ROTATE_MS = 10_000

export function AthenaWorkingVerb(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current
  const busy = createMemo(() => props.api.state.session.status(props.sessionID)?.type === "busy")

  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((value) => value + 1), ROTATE_MS)
  timer.unref?.()
  onCleanup(() => clearInterval(timer))

  const verb = createMemo(() => workingVerb(verbSeed(props.sessionID) + tick()))
  return (
    <Show when={busy()}>
      <text fg={theme().textMuted} wrapMode="none" selectable={false}>
        {verb()}…
      </text>
    </Show>
  )
}
