// The home screen hero — replaces the bare wordmark in the home_logo slot so
// the idle screen rhymes with the splash (docs/ui-identity-design.md): the
// six-spoke mark above the native shimmering wordmark, the epithet, and the
// meander rule. The mark steps down responsively so short terminals keep the
// prompt and footer on screen.

import { For, Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { markLines } from "../util/athena-identity"
import { Logo } from "./logo"

const RULE = "─".repeat(15) + " ◆ " + "─".repeat(15)

export function AthenaHomeHero() {
  const theme = useTheme().theme
  const dimensions = useTerminalDimensions()
  // Full mark from 32 rows, compact mark from 26, wordmark only below that.
  const spokeLen = createMemo(() => (dimensions().height >= 32 ? 3 : dimensions().height >= 26 ? 2 : 0))
  const mark = createMemo(() => (spokeLen() > 0 ? markLines(spokeLen(), spokeLen()) : []))

  return (
    <box flexDirection="column" alignItems="center" flexShrink={0}>
      <Show when={mark().length > 0}>
        <box flexDirection="column" alignItems="center" paddingBottom={1}>
          <For each={mark()}>
            {(line) => (
              <text fg={theme.primary} selectable={false}>
                {line}
              </text>
            )}
          </For>
        </box>
      </Show>
      <Logo />
      <text fg={theme.textMuted} selectable={false}>
        c o m m a n d   r o o m
      </text>
      <box paddingTop={1}>
        <text fg={theme.border} selectable={false}>
          {RULE}
        </text>
      </box>
    </box>
  )
}
