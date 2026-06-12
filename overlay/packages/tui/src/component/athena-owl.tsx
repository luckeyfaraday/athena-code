// The Athena owl — braille stipple art, the masthead and the logo
// (docs/ui-identity-design.md). One bird at one scale everywhere: perched it
// rests with crescent eyes and on a rare randomized timer glances up at you;
// at startup the same owl swoops in from the top-left as the flight sprite,
// lands, glances, and settles. The face row renders one step brighter than
// the body so the eyes carry the expression.

import type { RGBA } from "@opentui/core"
import { For, Match, Switch, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
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
// you, then settles into the resting pose. When `depart` flips true (the
// first message being typed), it takes off and crosses to the right edge of
// the screen, accelerating as it goes; a departure triggered mid-arrival
// continues from wherever the owl is. The scene box keeps the perched owl's
// footprint through every phase so the layout never jumps.
export function AthenaMastheadOwl(props: {
  color: RGBA
  faceColor?: RGBA
  width: Accessor<number>
  depart?: Accessor<boolean>
}) {
  const perched = owlPerchedLines()
  const owlWidth = perched[0].length
  const owlHeight = perched.length
  // The flight band the sprite occupies when level with the perched owl.
  const perchY = owlHeight - OWL_FLIGHT_HEIGHT

  const sceneWidth = () => Math.max(props.width(), owlWidth)
  const perchX = () => Math.floor((sceneWidth() - owlWidth) / 2) + Math.floor((owlWidth - OWL_FLIGHT_WIDTH) / 2)

  // Skip the arrival theatrics when there is no room for a glide worth
  // watching; the departure still plays from the perch.
  const fly = !flownThisLaunch && props.width() >= owlWidth + OWL_FLIGHT_WIDTH * 2
  flownThisLaunch = true

  type Phase = "arrive" | "perch" | "depart" | "gone"
  const [phase, setPhase] = createSignal<Phase>(fly ? "arrive" : "perch")
  const [step, setStep] = createSignal(0)
  // Where a departure starts from: the perch, or mid-air when triggered
  // during the arrival.
  let departFromX = perchX()
  let lastX = fly ? -OWL_FLIGHT_WIDTH : perchX()

  let timer: ReturnType<typeof setInterval> | undefined
  const stopTimer = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  onCleanup(stopTimer)

  const beginPhase = (next: "arrive" | "depart") => {
    stopTimer()
    setStep(0)
    setPhase(next)
    const steps = next === "arrive" ? ARRIVE_STEPS : DEPART_STEPS
    timer = setInterval(() => {
      setStep((value) => {
        if (value + 1 >= steps) {
          stopTimer()
          setPhase(next === "arrive" ? "perch" : "gone")
        }
        return value + 1
      })
    }, FLIGHT_STEP_MS)
    timer.unref?.()
  }
  if (fly) beginPhase("arrive")

  createEffect(() => {
    if (!props.depart?.()) return
    const current = phase()
    if (current === "depart" || current === "gone") return
    departFromX = current === "perch" ? perchX() : lastX
    beginPhase("depart")
  })

  const scene = createMemo(() => {
    const width = sceneWidth()
    if (phase() === "arrive") {
      // Glide from off-screen top-left to the perch, settling level with the
      // owl's body for a same-size sprite-to-perch handoff.
      const t = step() / ARRIVE_STEPS
      const x = Math.round(-OWL_FLIGHT_WIDTH + (perchX() + OWL_FLIGHT_WIDTH) * t)
      lastX = x
      return flightScene(width, owlHeight, x, Math.round(perchY * t), owlFlightFrame(step()))
    }
    // Departure: lift off the perch and accelerate out past the right edge.
    const t = step() / DEPART_STEPS
    const x = Math.round(departFromX + (width - departFromX) * t * t)
    const y = step() < 2 ? perchY : 0
    return flightScene(width, owlHeight, x, y, owlFlightFrame(step()))
  })

  return (
    <Switch>
      <Match when={phase() === "perch"}>
        <AthenaPerchedOwl color={props.color} faceColor={props.faceColor} initialAlert={fly} />
      </Match>
      <Match when={phase() === "gone"}>
        <box height={owlHeight} flexShrink={0} />
      </Match>
      <Match when={true}>
        <box flexDirection="column" flexShrink={0}>
          <For each={scene()}>
            {(line) => (
              <text fg={props.color} wrapMode="none" selectable={false}>
                {line}
              </text>
            )}
          </For>
        </box>
      </Match>
    </Switch>
  )
}
