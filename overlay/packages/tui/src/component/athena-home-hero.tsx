// The home screen masthead — the owl IS the logo (docs/ui-identity-design.md):
// the perched braille owl with a single letterspaced wordmark line under it,
// nothing else. The owl swoops in once per launch (AthenaMastheadOwl) — that
// flight is the startup animation — and takes off to the right when the
// first message is typed. On very short terminals the masthead drops to the
// wordmark line alone.

import { Show, createMemo, createSignal, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { usePromptRef } from "../context/prompt"
import { AthenaMastheadOwl } from "./athena-owl"

// Rows needed to keep the prompt, command room, and footer on screen below
// the six-row owl.
const OWL_MIN_ROWS = 24

export function AthenaHomeHero() {
  const theme = useTheme().theme
  const dimensions = useTerminalDimensions()
  const promptRef = usePromptRef()
  // The flight scene spans the home body's usable width (route padding of 2
  // per side) so the owl can enter from the very edge of the terminal.
  const sceneWidth = createMemo(() => Math.max(dimensions().width - 4, 0))

  // The owl departs when the first message is typed. The prompt binds its ref
  // during the same render pass that mounts the hero, so arm the memo in
  // onMount — only then does it reach the prompt store and track keystrokes.
  const [armed, setArmed] = createSignal(false)
  onMount(() => setArmed(true))
  const typing = createMemo(() => armed() && (promptRef.current?.current.input.length ?? 0) > 0)

  return (
    <box flexDirection="column" alignItems="center" flexShrink={0}>
      <Show when={dimensions().height >= OWL_MIN_ROWS}>
        <AthenaMastheadOwl color={theme.textMuted} faceColor={theme.text} width={sceneWidth} depart={typing} />
      </Show>
      <box paddingTop={1}>
        <text wrapMode="none" selectable={false}>
          <span style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>A T H E N A</span>
          <span style={{ fg: theme.textMuted }}>{"   ·   c o m m a n d   r o o m"}</span>
        </text>
      </box>
    </box>
  )
}
