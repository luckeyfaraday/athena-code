// The Athena owl — a four-line state-reactive companion glyph: ear tufts,
// face, wing, perch (docs/ui-identity-design.md). Functional art: readable
// from peripheral vision as "idle / reasoning / working" without parsing any
// text. Idle owls blink occasionally on a randomized timer — rare enough to
// be noticed, not watched; working owls tick their wing in time with the
// activity. The face renders one step brighter than the body so the eyes
// carry the expression.

import type { RGBA } from "@opentui/core"
import { For, createSignal, onCleanup } from "solid-js"
import { OWL_FACE_ROW, owlLines, type OwlState } from "../util/athena-identity"

const BLINK_MS = 140
const BLINK_MIN_GAP_MS = 6_000
const BLINK_MAX_GAP_MS = 14_000
const WING_TICK_MS = 400

export function AthenaOwl(props: { state: () => OwlState; color: RGBA; faceColor?: RGBA }) {
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

  const wingTimer = setInterval(() => setTick((value) => !value), WING_TICK_MS)
  wingTimer.unref?.()
  onCleanup(() => {
    clearTimeout(blinkTimer)
    clearInterval(wingTimer)
  })

  const lines = () => owlLines(props.state(), blink(), tick())
  return (
    <box flexDirection="column" flexShrink={0}>
      <For each={lines()}>
        {(line, index) => (
          <text fg={index() === OWL_FACE_ROW ? (props.faceColor ?? props.color) : props.color} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}
