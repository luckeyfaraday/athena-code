// The Athena owl — braille stipple art, the masthead and the logo.
// One bird at one scale everywhere: perched it
// rests with crescent eyes and on a rare randomized timer glances up at you;
// at startup the same owl swoops in from the top-left as the flight sprite,
// lands, glances, and settles. The face row renders one step brighter than
// the body so the eyes carry the expression.

import type { RGBA } from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useRoute } from "../context/route"
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

// The flights: the startup swoop in from the top-left, and the departure —
// when the first message is typed the owl takes off and crosses to the right
// edge, accelerating as it goes.
const FLIGHT_STEP_MS = 90
const ARRIVE_STEPS = 14
const DEPART_STEPS = 12

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

  const [step, setStep] = createSignal(fly ? 0 : ARRIVE_STEPS)
  if (fly) {
    const timer = setInterval(() => {
      setStep((value) => {
        if (value + 1 >= ARRIVE_STEPS) clearInterval(timer)
        return value + 1
      })
    }, FLIGHT_STEP_MS)
    timer.unref?.()
    onCleanup(() => clearInterval(timer))
  }
  const landed = createMemo(() => step() >= ARRIVE_STEPS)

  const scene = createMemo(() => {
    const width = Math.max(props.width(), owlWidth)
    // Glide from off-screen top-left to the perch, settling level with the
    // owl's body for a same-size sprite-to-perch handoff.
    const endX = Math.floor((width - owlWidth) / 2) + Math.floor((owlWidth - OWL_FLIGHT_WIDTH) / 2)
    const endY = owlHeight - OWL_FLIGHT_HEIGHT
    const t = step() / ARRIVE_STEPS
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

// The send-off — registered in the `app` slot so it overlays whatever route
// is showing and survives the home screen unmounting. When the user submits
// their first message the route flips home → session; the owl, gone with the
// masthead, reappears crossing the top of the new session screen and
// accelerates off the right edge, carrying the message away. Once per launch.
export function AthenaDepartureFlight(props: { color: () => RGBA }) {
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const [step, setStep] = createSignal(-1)
  let previous = route.data.type
  let flown = false
  let timer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => timer && clearInterval(timer))

  createEffect(() => {
    const current = route.data.type
    const from = previous
    previous = current
    // Only the first hop out of the home screen — a resumed session at
    // startup or later navigation doesn't send the owl off again.
    if (flown || current !== "session" || from !== "home") return
    flown = true
    setStep(0)
    timer = setInterval(() => {
      setStep((value) => {
        if (value + 1 >= DEPART_STEPS && timer) clearInterval(timer)
        return value + 1
      })
    }, FLIGHT_STEP_MS)
    timer.unref?.()
  })

  const active = createMemo(() => step() >= 0 && step() < DEPART_STEPS)
  const flight = createMemo(() => {
    const width = dimensions().width
    const start = Math.floor((width - OWL_FLIGHT_WIDTH) / 2)
    const t = Math.max(step(), 0) / DEPART_STEPS
    const x = Math.round(start + (width - start) * t * t)
    // Clip at the right edge ourselves so the absolute box never reaches
    // outside the screen.
    const visible = Math.max(0, Math.min(OWL_FLIGHT_WIDTH, width - x))
    return { x, lines: visible > 0 ? owlFlightFrame(step()).map((line) => line.slice(0, visible)) : [] }
  })

  // The box always renders: a slot entry whose initial render produces no
  // output is dropped by the slot host for good (hasInitialOutput), so the
  // idle state is a zero-size box rather than nothing.
  const visible = createMemo(() => active() && flight().lines.length > 0)
  return (
    <box
      position="absolute"
      top={1}
      left={visible() ? flight().x : 0}
      width={visible() ? flight().lines[0].length : 0}
      height={visible() ? OWL_FLIGHT_HEIGHT : 0}
      zIndex={5500}
      flexDirection="column"
      flexShrink={0}
    >
      <Show when={visible()}>
        <For each={flight().lines}>
          {(line) => (
            <text fg={props.color()} wrapMode="none" selectable={false}>
              {line}
            </text>
          )}
        </For>
      </Show>
    </box>
  )
}
