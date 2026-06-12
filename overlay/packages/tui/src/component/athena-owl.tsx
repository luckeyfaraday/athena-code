// The Athena owl — braille stipple art, the masthead and the logo
// (docs/ui-identity-design.md). One bird at one scale everywhere: perched it
// rests with crescent eyes and on a rare randomized timer glances up at you;
// at startup the same owl swoops in from the top-left as the flight sprite,
// lands, glances, and settles. The face row renders one step brighter than
// the body so the eyes carry the expression.

import type { RGBA } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import {
  OWL_FLIGHT_HEIGHT,
  OWL_FLIGHT_WIDTH,
  OWL_PERCHED_FACE_ROWS,
  flightScene,
  owlFlightFrame,
  owlPerchedLines,
} from "../util/athena-identity"

const GLANCE_MS = 700
const GLANCE_MIN_GAP_MS = 6_000
const GLANCE_MAX_GAP_MS = 14_000

// The startup flight: one swoop from the top-left down to the perch.
const FLIGHT_STEP_MS = 90
const FLIGHT_STEPS = 14

function createGlance(): Accessor<boolean> {
  const [glance, setGlance] = createSignal(false)
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    const gap = GLANCE_MIN_GAP_MS + Math.random() * (GLANCE_MAX_GAP_MS - GLANCE_MIN_GAP_MS)
    timer = setTimeout(() => {
      setGlance(true)
      timer = setTimeout(() => {
        setGlance(false)
        schedule()
      }, GLANCE_MS)
    }, gap)
    timer.unref?.()
  }
  schedule()
  onCleanup(() => clearTimeout(timer))
  return glance
}

// The perched owl, resting with crescent eyes; on a rare randomized timer it
// briefly opens them and glances up at you. `initialAlert` starts the owl
// wide-eyed and lets it settle — the glance it gives you right after landing
// from the startup flight.
export function AthenaPerchedOwl(props: { color: RGBA; faceColor?: RGBA; initialAlert?: boolean }) {
  const glance = createGlance()
  const [settling, setSettling] = createSignal(props.initialAlert ?? false)
  if (props.initialAlert) {
    const settle = setTimeout(() => setSettling(false), GLANCE_MS)
    settle.unref?.()
    onCleanup(() => clearTimeout(settle))
  }
  const lines = () => owlPerchedLines(glance() || settling())
  return (
    <box flexDirection="column" flexShrink={0}>
      <For each={lines()}>
        {(line, index) => (
          <text
            fg={OWL_PERCHED_FACE_ROWS.includes(index()) ? (props.faceColor ?? props.color) : props.color}
            wrapMode="none"
            selectable={false}
          >
            {line}
          </text>
        )}
      </For>
    </box>
  )
}

// Whether the startup flight has already played — the owl flies in once per
// launch, not on every return to the home route.
let flownThisLaunch = false

// The home masthead: once per launch the owl swoops in from the top-left —
// wings cycling, descending toward the perch — lands with an alert glance at
// you, then settles into the resting pose. The scene box keeps the perched
// owl's footprint for the whole flight so the layout never jumps.
export function AthenaMastheadOwl(props: { color: RGBA; faceColor?: RGBA; width: Accessor<number> }) {
  const perched = owlPerchedLines()
  const owlWidth = perched[0].length
  const owlHeight = perched.length

  // Skip the theatrics when there is no room for a glide worth watching.
  const fly = !flownThisLaunch && props.width() >= owlWidth + OWL_FLIGHT_WIDTH * 2
  flownThisLaunch = true

  const [step, setStep] = createSignal(fly ? 0 : FLIGHT_STEPS)
  if (fly) {
    const timer = setInterval(() => {
      setStep((value) => {
        if (value + 1 >= FLIGHT_STEPS) clearInterval(timer)
        return value + 1
      })
    }, FLIGHT_STEP_MS)
    timer.unref?.()
    onCleanup(() => clearInterval(timer))
  }
  const landed = createMemo(() => step() >= FLIGHT_STEPS)

  const scene = createMemo(() => {
    const width = Math.max(props.width(), owlWidth)
    // Glide from off-screen top-left to the perch, settling level with the
    // owl's body for a same-size sprite-to-perch handoff.
    const endX = Math.floor((width - owlWidth) / 2) + Math.floor((owlWidth - OWL_FLIGHT_WIDTH) / 2)
    const endY = owlHeight - OWL_FLIGHT_HEIGHT
    const t = step() / FLIGHT_STEPS
    const x = Math.round(-OWL_FLIGHT_WIDTH + (endX + OWL_FLIGHT_WIDTH) * t)
    const y = Math.round(endY * t)
    return flightScene(width, owlHeight, x, y, owlFlightFrame(step()))
  })

  return (
    <Show
      when={!landed()}
      fallback={<AthenaPerchedOwl color={props.color} faceColor={props.faceColor} initialAlert={fly} />}
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
