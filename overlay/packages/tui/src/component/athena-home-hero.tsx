// The home screen masthead — the owl IS the logo (docs/ui-identity-design.md):
// the grand braille owl on top with a single letterspaced wordmark line under
// it, nothing else. The owl flies in once per launch (AthenaMastheadOwl) and
// steps down responsively — small companion owl on short terminals, wordmark
// only when there is no room for art at all.

import { Show, createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { AthenaMastheadOwl, AthenaOwl } from "./athena-owl"

// Rows needed to keep the prompt, command room, and footer on screen below
// each masthead tier: the 16-row grand owl, the 4-row companion owl.
const GRAND_MIN_ROWS = 40
const SMALL_MIN_ROWS = 26

export function AthenaHomeHero() {
  const theme = useTheme().theme
  const dimensions = useTerminalDimensions()
  const tier = createMemo(() =>
    dimensions().height >= GRAND_MIN_ROWS ? "grand" : dimensions().height >= SMALL_MIN_ROWS ? "small" : "word",
  )
  // The flight scene spans the home body's usable width (route padding of 2
  // per side) so the owl can enter from the very edge of the terminal.
  const sceneWidth = createMemo(() => Math.max(dimensions().width - 4, 0))

  return (
    <box flexDirection="column" alignItems="center" flexShrink={0}>
      <Show when={tier() === "grand"}>
        <AthenaMastheadOwl color={theme.textMuted} faceColor={theme.text} width={sceneWidth} />
      </Show>
      <Show when={tier() === "small"}>
        <AthenaOwl state={() => "idle"} color={theme.textMuted} faceColor={theme.text} />
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
