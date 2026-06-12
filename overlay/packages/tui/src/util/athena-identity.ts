// The voice of the command room (docs/ui-identity-design.md): the working-verb
// lexicon and the daily maxim. Flavor lives in spinners, summaries, and
// empty-states only — never in command names or error paths. Pure helpers so
// tests can pin the rotation behavior.

export const WORKING_VERBS = [
  "deliberating",
  "weaving",
  "surveying",
  "marshalling",
  "reckoning",
  "charting",
  "composing",
  "consulting the archive",
] as const

// Stable small hash so each session starts its verb rotation at a different
// point instead of every pane showing "deliberating" in lockstep.
export function verbSeed(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export function workingVerb(seed: number): string {
  return WORKING_VERBS[Math.abs(seed) % WORKING_VERBS.length]
}

export interface Aphorism {
  text: string
  source: string
}

// Real, attributed maxims only (seriousness budget): strategy and craft, one
// line each. Rotated by calendar day so the home screen is stable within a
// day but not stale across weeks.
export const APHORISMS: ReadonlyArray<Aphorism> = [
  { text: "Know thyself.", source: "Delphic maxim" },
  { text: "Nothing in excess.", source: "Delphic maxim" },
  { text: "Measure is best.", source: "Cleobulus" },
  { text: "Character is destiny.", source: "Heraclitus" },
  { text: "The beginning is half of the whole.", source: "Pythagoras" },
  { text: "Well begun is half done.", source: "Aristotle" },
  { text: "Make haste slowly.", source: "Augustus" },
  { text: "No one steps in the same river twice.", source: "Heraclitus" },
  { text: "The unexamined life is not worth living.", source: "Socrates" },
  { text: "Practice is everything.", source: "Periander" },
]

export function dailyAphorism(date = new Date()): Aphorism {
  const day = Math.floor(date.getTime() / 86_400_000)
  return APHORISMS[day % APHORISMS.length]
}

// --- the weave ---------------------------------------------------------------

// Athena's working animation: a shuttle carrying the weft across the warp.
// The thread behind the shuttle is woven, the warp ahead is bare; at the far
// selvedge it pauses, runs home along the finished row, and the next row
// begins. Pure frame strings so tests can pin the loom; the per-glyph colors
// live in util/athena-weave.ts.
export const WEAVE_SHUTTLE = "◆"
export const WEAVE_WOVEN = "─"
export const WEAVE_BARE = "╌"

export function weaveFrames(width = 8, holdHome = 5, holdFar = 3): string[] {
  const frames: string[] = []
  for (let i = 0; i < width; i++) {
    frames.push(WEAVE_WOVEN.repeat(i) + WEAVE_SHUTTLE + WEAVE_BARE.repeat(width - 1 - i))
  }
  for (let i = 0; i < holdFar; i++) {
    frames.push(WEAVE_WOVEN.repeat(width - 1) + WEAVE_SHUTTLE)
  }
  for (let i = width - 2; i >= 0; i--) {
    frames.push(WEAVE_WOVEN.repeat(i) + WEAVE_SHUTTLE + WEAVE_WOVEN.repeat(width - 1 - i))
  }
  for (let i = 0; i < holdHome; i++) {
    frames.push(WEAVE_SHUTTLE + WEAVE_BARE.repeat(width - 1))
  }
  return frames
}

// --- the owl ---------------------------------------------------------------

// The perched Athena owl — the masthead and the logo — rendered as
// dot-density stipple art on braille cells (each char a 2x4 dot grid): ear
// tufts, a heavy brow, sleepy crescent eyes, talons on a branch. Sized to the
// flight sprite below so the landing reads as the same bird folding its
// wings. Baked by scripts/generate-braille-owl.ts (seeded, reproducible) —
// regenerate there, never hand-edit dots. The resting frame has the eyes
// closed to crescents; the alternate frame opens them — the owl glancing up
// at you — shown on a rare randomized timer and right after landing.
export const OWL_PERCHED_FACE_ROWS: ReadonlyArray<number> = [2]

const OWL_PERCHED_RESTING: ReadonlyArray<string> = [
  "⠀⠀⢀⣶⣀⢀⣀⣀⣴⡀⠀⠀",
  "⠀⠀⣼⠍⠷⣬⣤⠾⠛⣧⠀⠀",
  "⠀⠀⠻⣦⡴⠂⠐⢦⣴⠗⠀⠀",
  "⠀⠀⢾⡡⠠⠘⠣⡈⡈⣱⠀⠀",
  "⠀⠀⢂⡀⠨⠘⠀⠘⢜⡘⠀⠀",
  "⠀⣄⠤⠙⠷⠇⠾⠻⠟⠶⠐⠚",
]

const OWL_PERCHED_ALERT: ReadonlyArray<string> = [
  "⠀⠀⢀⣶⣀⢀⣀⣀⣴⡀⠀⠀",
  "⠀⠀⣼⠍⠷⣬⣤⠾⠛⣧⠀⠀",
  "⠀⠀⠫⡿⠿⠀⠀⠿⢿⠕⠀⠀",
  "⠀⠀⢾⡡⠠⠘⠣⡈⡈⣱⠀⠀",
  "⠀⠀⢂⡀⠨⠘⠀⠘⢜⡘⠀⠀",
  "⠀⣄⠤⠙⠷⠇⠾⠻⠟⠶⠐⠚",
]

export function owlPerchedLines(alert = false): string[] {
  return [...(alert ? OWL_PERCHED_ALERT : OWL_PERCHED_RESTING)]
}

// --- the owl in flight ---------------------------------------------------------

// The startup sprite: the owl gliding in side-on, facing right, three wing
// positions cycled while it swoops down to the perch. Baked by
// scripts/generate-braille-owl.ts like the perched owl — regenerate there,
// never hand-edit dots. Index order: wings up, mid, down.
export const OWL_FLIGHT_FRAMES: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "⠀⠀⠀⠈⢷⣄⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠘⠻⢶⣄⠀⠀⠀⠀",
    "⠀⠀⠀⣀⡠⠬⣷⣻⣷⡏⣽⣷",
    "⠠⠶⠻⠩⠹⢴⣻⣏⡏⠟⠒⠋",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  ],
  [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠻⢶⡤⣄⡀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⣈⡿⠽⣷⣶⣴⡏⣽⣷",
    "⠠⠶⠻⠩⠹⢴⣻⣏⡏⠟⠒⠋",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  ],
  [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⣀⡠⠤⣤⣠⣴⡏⣽⣷",
    "⠠⠶⠻⠩⠹⢴⣻⣿⡏⠟⠒⠋",
    "⠀⠀⠀⠀⣠⡾⠋⠁⠀⠀⠀⠀",
  ],
]

export const OWL_FLIGHT_WIDTH = OWL_FLIGHT_FRAMES[0][0].length
export const OWL_FLIGHT_HEIGHT = OWL_FLIGHT_FRAMES[0].length

// Wing cycle while flying: up → mid → down → mid → up …
export function owlFlightFrame(step: number): ReadonlyArray<string> {
  const cycle = [0, 1, 2, 1] as const
  return OWL_FLIGHT_FRAMES[cycle[Math.abs(step) % cycle.length]]
}

// Compose the flying sprite onto a blank scene of `width` x `height` cells with
// the sprite's top-left at (x, y) — pure string padding so the swoop is
// testable; the component just advances (x, y) along the glide path. The
// sprite clips cleanly at every edge so it can enter from off-screen.
export function flightScene(width: number, height: number, x: number, y: number, sprite: ReadonlyArray<string>): string[] {
  const blank = " ".repeat(width)
  const scene: string[] = []
  for (let row = 0; row < height; row++) {
    const spriteRow = row - y
    if (spriteRow < 0 || spriteRow >= sprite.length) {
      scene.push(blank)
      continue
    }
    const line = sprite[spriteRow]
    const from = Math.max(0, -x)
    const to = Math.min(line.length, width - x)
    if (from >= to) {
      scene.push(blank)
      continue
    }
    const left = Math.max(0, x)
    const visible = line.slice(from, to)
    scene.push(" ".repeat(left) + visible + " ".repeat(width - left - visible.length))
  }
  return scene
}
