// The Athena owl — a two-line state-reactive companion glyph
// (docs/ui-identity-design.md). Functional art: readable from peripheral
// vision as "idle / reasoning / working" without parsing any text. Idle owls
// blink occasionally on a randomized timer — rare enough to be noticed, not
// watched; working owls tick their tail in time with the activity.

import type { RGBA } from "@opentui/core"
import { createSignal, onCleanup } from "solid-js"
import { owlLines, type OwlState } from "../util/athena-identity"

const BLINK_MS = 140
const BLINK_MIN_GAP_MS = 6_000
const BLINK_MAX_GAP_MS = 14_000
const TAIL_TICK_MS = 400

export function AthenaOwl(props: { state: () => OwlState; color: RGBA }) {
  const [blink, setBlink] = createSignal(false)
  const [tick, setTick] = createSignal(false)

  let blinkTimer: ReturnType<typeof setTimeout>
  const scheduleBlink = () => {
    const gap = BLINK_MIN_GAP_MS + Math.random() * (BLINK_MAX_GAP_MS - BLINK_MIN_GAP_MS)
    blinkTimer = setTimeout(() => {
      setBlink(true)
      blinkTimer = setTimeout(() => {
        setBlink(false)
        scheduleBlink()
      }, BLINK_MS)
    }, gap)
    blinkTimer.unref?.()
  }
  scheduleBlink()

  const tailTimer = setInterval(() => setTick((value) => !value), TAIL_TICK_MS)
  tailTimer.unref?.()
  onCleanup(() => {
    clearTimeout(blinkTimer)
    clearInterval(tailTimer)
  })

  const lines = () => owlLines(props.state(), blink(), tick())
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={props.color} selectable={false}>
        {lines()[0]}
      </text>
      <text fg={props.color} selectable={false}>
        {lines()[1]}
      </text>
    </box>
  )
}
