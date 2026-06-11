import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js"
import { useTheme } from "../context/theme"
import { markLines } from "../util/athena-identity"
import { Logo } from "./logo"

// Athena splash — a branded loading screen shown while the TUI plugin host
// boots, replacing the blank screen (the app body only renders once ready()
// flips). Ported from the legacy curses splash (context-workspace cli/splash.py):
// the six-spoke Athena mark blooms outward from a hollow centre, the wordmark
// appears beneath it (the native Logo component, whose shimmer engine keeps it
// alive while loading), then the subtitle and a loading ticker fade in.
//
// Timing mirrors the legacy splash: at least MIN_MS so it never just flickers,
// at most MAX_MS so a pathologically slow boot can't hold the app hostage.

const FRAME_MS = 35
const BURST_FRAMES = 12 // frames to fully bloom the mark
const TICKER_FRAMES = BURST_FRAMES + 8 // subtitle + ticker reveal
const MIN_MS = 900
const MAX_MS = 8000

const SPOKE_LEN = 3

export function AthenaSplash(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const [frame, setFrame] = createSignal(0)
  const [done, setDone] = createSignal(false)
  const start = Date.now()
  const timer = setInterval(() => {
    const elapsed = Date.now() - start
    if (elapsed >= MAX_MS || (props.ready() && elapsed >= MIN_MS)) {
      clearInterval(timer)
      setDone(true)
      return
    }
    setFrame((f) => f + 1)
  }, FRAME_MS)
  timer.unref?.()
  onCleanup(() => clearInterval(timer))

  const lines = createMemo(() => markLines(Math.min(SPOKE_LEN, 1 + Math.floor(frame() / 4))))
  const dots = createMemo(() => ".".repeat(1 + (Math.floor(frame() / 8) % 3)))

  return (
    <Show when={!done()}>
      <box
        position="absolute"
        left={0}
        right={0}
        top={0}
        bottom={0}
        zIndex={6000}
        backgroundColor={theme.background}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
      >
        <box flexDirection="column" alignItems="center" flexShrink={0}>
          <For each={lines()}>
            {(line) => (
              <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
                {line}
              </text>
            )}
          </For>
        </box>
        <Show when={frame() >= BURST_FRAMES}>
          <box flexShrink={0} paddingTop={1}>
            <Logo />
          </box>
        </Show>
        <Show when={frame() >= TICKER_FRAMES}>
          <box flexDirection="column" alignItems="center" flexShrink={0} paddingTop={1}>
            <text fg={theme.textMuted} selectable={false}>
              c o m m a n d   r o o m
            </text>
            <text fg={theme.textMuted} selectable={false}>
              summoning the command room{dots()}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  )
}
