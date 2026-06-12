// The Athena owl — a four-line state-reactive companion glyph: ear tufts,
// face, wing, perch (docs/ui-identity-design.md). Functional art: readable
// from peripheral vision as "idle / reasoning / working" without parsing any
// text. Idle owls blink occasionally on a randomized timer — rare enough to
// be noticed, not watched; working owls tick their wing in time with the
// activity. The face renders one step brighter than the body so the eyes
// carry the expression.

import type { RGBA } from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { splashActive } from "./athena-splash"
import {
  OWL_FACE_ROW,
  OWL_FLIGHT_HEIGHT,
  OWL_FLIGHT_WIDTH,
  OWL_GRAND_FACE_ROWS,
  flightScene,
  owlFlightFrame,
  owlGrandLines,
  owlLines,
  type OwlState,
} from "../util/athena-identity"

const BLINK_MS = 140
const BLINK_MIN_GAP_MS = 6_000
const BLINK_MAX_GAP_MS = 14_000
const WING_TICK_MS = 400
const LANDING_GLANCE_MS = 700

// The entrance flight: one swoop from the top-left down to the perch.
const FLIGHT_STEP_MS = 90
const FLIGHT_STEPS = 14

function createBlink(): Accessor<boolean> {
  const [blink, setBlink] = createSignal(false)
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
  onCleanup(() => clearTimeout(blinkTimer))
  return blink
}

export function AthenaOwl(props: { state: () => OwlState; color: RGBA; faceColor?: RGBA }) {
  const blink = createBlink()
  const [tick, setTick] = createSignal(false)

  const wingTimer = setInterval(() => setTick((value) => !value), WING_TICK_MS)
  wingTimer.unref?.()
  onCleanup(() => clearInterval(wingTimer))

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

// The full perched owl for tall home screens — braille stipple art, resting
// with crescent eyes. The blink timer is inverted here: on the same rare
// randomized schedule, the owl briefly opens its eyes and glances up at you.
// `initialAlert` starts the owl wide-eyed and lets it settle — the glance it
// gives you right after landing from the entrance flight.
export function AthenaGrandOwl(props: { color: RGBA; faceColor?: RGBA; initialAlert?: boolean }) {
  const alert = createBlink()
  const [settling, setSettling] = createSignal(props.initialAlert ?? false)
  if (props.initialAlert) {
    const settle = setTimeout(() => setSettling(false), LANDING_GLANCE_MS)
    settle.unref?.()
    onCleanup(() => clearTimeout(settle))
  }
  const lines = () => owlGrandLines(alert() || settling())
  return (
    <box flexDirection="column" flexShrink={0}>
      <For each={lines()}>
        {(line, index) => (
          <text
            fg={OWL_GRAND_FACE_ROWS.includes(index()) ? (props.faceColor ?? props.color) : props.color}
            selectable={false}
          >
            {line}
          </text>
        )}
      </For>
    </box>
  )
}

// Whether the entrance flight has already played — the owl flies in once per
// launch, not on every return to the home route.
let flownThisLaunch = false

// The home masthead: once per launch the owl swoops in from the top-left —
// wings cycling, descending toward the perch — lands as the grand owl with an
// alert glance at you, then settles into the resting pose. The scene box keeps
// the grand owl's full height for the whole flight so the layout never jumps.
export function AthenaMastheadOwl(props: { color: RGBA; faceColor?: RGBA; width: Accessor<number> }) {
  const perched = owlGrandLines()
  const owlWidth = perched[0].length
  const owlHeight = perched.length

  // Skip the theatrics when there is no room for a glide worth watching.
  const fly = !flownThisLaunch && props.width() >= owlWidth + OWL_FLIGHT_WIDTH * 2
  flownThisLaunch = true

  const [step, setStep] = createSignal(fly ? 0 : FLIGHT_STEPS)
  if (fly) {
    // Hold on the first frame (sprite still off-screen) while the startup
    // splash covers the app, so the swoop plays in view, not behind it.
    let timer: ReturnType<typeof setInterval> | undefined
    createEffect(() => {
      if (splashActive() || timer) return
      timer = setInterval(() => {
        setStep((value) => {
          if (value + 1 >= FLIGHT_STEPS && timer) clearInterval(timer)
          return value + 1
        })
      }, FLIGHT_STEP_MS)
      timer.unref?.()
    })
    onCleanup(() => timer && clearInterval(timer))
  }
  const landed = createMemo(() => step() >= FLIGHT_STEPS)

  const scene = createMemo(() => {
    const width = Math.max(props.width(), owlWidth)
    // Glide from off-screen top-left to where the perched owl's body will be.
    const endX = Math.floor((width - owlWidth) / 2) + Math.floor((owlWidth - OWL_FLIGHT_WIDTH) / 2)
    const endY = owlHeight - OWL_FLIGHT_HEIGHT - 6
    const t = step() / FLIGHT_STEPS
    const x = Math.round(-OWL_FLIGHT_WIDTH + (endX + OWL_FLIGHT_WIDTH) * t)
    const y = Math.round(endY * t)
    return flightScene(width, owlHeight, x, y, owlFlightFrame(step()))
  })

  return (
    <Show
      when={!landed()}
      fallback={<AthenaGrandOwl color={props.color} faceColor={props.faceColor} initialAlert={fly} />}
    >
      <box flexDirection="column" flexShrink={0}>
        <For each={scene()}>
          {(line) => (
            <text fg={props.color} wrapMode="none" selectable={false}>
              {line}
            </text>
          )}
        </For>
      </box>
    </Show>
  )
}
