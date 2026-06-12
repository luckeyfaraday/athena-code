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

// --- the mark ---------------------------------------------------------------

// Six spokes of the Athena mark as (row-step, col-step, glyph). Columns step
// by two so the diagonals read at roughly the right angle given a terminal
// cell's ~2:1 height:width ratio. The centre cell stays hollow, like the SVG.
const MARK_SPOKES: ReadonlyArray<readonly [number, number, string]> = [
  [-1, 0, "|"],
  [1, 0, "|"],
  [-1, -2, "\\"],
  [-1, 2, "/"],
  [1, -2, "/"],
  [1, 2, "\\"],
]

// Render the mark with `grown` of `spokeLen` segments per spoke — the splash
// animates grown upward; static renders pass grown >= spokeLen.
export function markLines(grown: number, spokeLen = 3): string[] {
  const rows = 2 * spokeLen + 1
  const cols = 4 * spokeLen + 1
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(" "))
  for (const [dy, dx, glyph] of MARK_SPOKES) {
    for (let i = 1; i <= Math.min(grown, spokeLen); i++) {
      grid[spokeLen + dy * i][2 * spokeLen + dx * i] = glyph
    }
  }
  return grid.map((row) => row.join(""))
}

// --- the meander -------------------------------------------------------------

// The signature horizontal motif (docs/ui-identity-design.md §5): a
// crenellated Greek-key run used where upstream draws a plain rule. Position
// i mod 4 walks ─ ┐ ␣ ┌, so widths of 4k+1 end on a clean ─.
const MEANDER = ["─", "┐", " ", "┌"] as const

export function meanderLine(width: number): string {
  let out = ""
  for (let i = 0; i < width; i++) out += MEANDER[i % MEANDER.length]
  return out
}

// --- the owl ---------------------------------------------------------------

export type OwlState = "idle" | "thinking" | "working"

// Pure frame function (rendered by component/athena-owl.tsx) so tests can pin
// every state without timers or JSX: ear tufts, face, wing, perch. The face
// is OWL_FACE_ROW so the renderer can light it differently from the body.
export const OWL_FACE_ROW = 1

export function owlLines(state: OwlState, blink = false, tick = false): string[] {
  const face = state === "thinking" || blink ? "(-,-)" : "(o,o)"
  const wing = state === "working" && tick ? "/)_)~" : "/)_)"
  return [",___,", face, wing, `-"-"-`]
}

// --- the grand owl -----------------------------------------------------------

// The full perched owl for the home screen when the terminal is tall enough,
// rendered as dot-density stipple art on braille cells (each char a 2x4 dot
// grid), after the classic pointillist owl illustrations: ear tufts, a heavy
// brow, sleepy crescent eyes, a long folded wing, the tail hanging past a
// diagonal branch. Baked by scripts/generate-braille-owl.ts (seeded,
// reproducible) — regenerate there, never hand-edit dots. The resting frame
// has the eyes closed to crescents; the alternate frame opens them wide — the
// owl glancing up at you — and is shown on the same rare randomized timer the
// companion owl blinks on.
export const OWL_GRAND_FACE_ROWS: ReadonlyArray<number> = [2, 3, 4]

const OWL_GRAND_RESTING: ReadonlyArray<string> = [
  "⠀⠀⠀⠀⠀⠖⡠⢠⢄⢀⠀⢀⡠⡤⢤⠤⣠⢄⡀⣀⡀⡄⣄⠶⡤⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢼⣼⠿⡽⠝⠁⠂⠀⠈⠀⠀⠠⠈⠻⣻⣺⢝⠃⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠨⡟⡉⠙⡻⢶⣦⣆⠀⠀⣠⣐⡶⠿⠋⠏⡼⡅⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢘⠟⡁⣴⠀⠄⠀⣥⠠⠀⣬⠀⠀⠀⣥⢀⡶⡇⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠢⣐⡜⠓⠒⠚⠃⢀⣀⠘⠗⢂⢚⣃⢫⠝⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⢀⠔⡿⠄⠀⡀⠄⠰⡇⠠⡠⡀⠘⠸⠤⡀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠠⠌⠃⠀⠌⠂⠀⠆⠀⡀⠅⠀⠀⠡⡄⠩⢳⡀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⢀⢆⢀⠀⠀⠑⠄⠀⢚⠠⡂⠄⠄⠀⠒⣠⠀⠈⢱⡀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠈⠵⠠⡀⠀⡈⠐⡄⢀⠠⠔⠈⠀⠀⡐⠰⠔⠰⢄⠅⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠘⣏⡀⠀⢀⠈⡁⠀⠅⠀⠀⠪⢁⠀⠘⠂⠐⠂⣌⠇⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢃⣘⡠⠀⠀⢀⠍⡊⠅⠀⠔⠂⠍⠃⡀⡈⣗⡛⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠹⡧⡐⢠⠀⠀⠆⠀⢀⠥⠁⠡⢸⢀⡠⠆⠀⠀⠀⠀⠀⡀⢀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⢮⡻⠂⠁⠀⠠⢀⣄⡀⣝⣦⣥⣴⡢⣾⣓⠯⠕⠛⠃",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣷⣴⣲⢐⣐⣟⣸⢳⢅⡝⠯⡉⠉⠀⠀⠀⠀⠀⠀",
  "⠄⠀⡀⢈⢤⠀⡖⣦⣖⡢⠾⠿⢽⣣⠨⢁⠀⢀⡔⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⡓⠒⠀⠟⠒⠊⠄⠀⠀⠀⠁⠀⠀⠀⠈⠉⠈⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
]

const OWL_GRAND_ALERT: ReadonlyArray<string> = [
  "⠀⠀⠀⠀⠀⠖⡠⢠⢄⢀⠀⢀⡠⡤⢤⠤⣠⢄⡀⣀⡀⡄⣄⠶⡤⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢼⣼⠿⡽⠝⠁⠂⠀⠈⠀⠀⠠⠈⠻⣻⣺⢝⠃⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠨⡟⡉⢹⡿⢶⣦⣆⠀⠀⣠⣔⡶⢿⡏⠏⡼⡅⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢘⠟⡁⣿⠰⣯⠆⣿⠠⠀⣿⠠⡟⠆⣿⢀⡶⡇⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠢⣐⡜⠳⠶⠞⠃⢀⣀⠘⠷⢦⢚⣃⢫⠝⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⢀⠔⡿⠄⠀⡀⠄⠰⡇⠠⡠⡀⠘⠸⠤⡀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠠⠌⠃⠀⠌⠂⠀⠆⠀⡀⠅⠀⠀⠡⡄⠩⢳⡀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⢀⢆⢀⠀⠀⠑⠄⠀⢚⠠⡂⠄⠄⠀⠒⣠⠀⠈⢱⡀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠈⠵⠠⡀⠀⡈⠐⡄⢀⠠⠔⠈⠀⠀⡐⠰⠔⠰⢄⠅⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠘⣏⡀⠀⢀⠈⡁⠀⠅⠀⠀⠪⢁⠀⠘⠂⠐⠂⣌⠇⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⢃⣘⡠⠀⠀⢀⠍⡊⠅⠀⠔⠂⠍⠃⡀⡈⣗⡛⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠹⡧⡐⢠⠀⠀⠆⠀⢀⠥⠁⠡⢸⢀⡠⠆⠀⠀⠀⠀⠀⡀⢀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⢮⡻⠂⠁⠀⠠⢀⣄⡀⣝⣦⣥⣴⡢⣾⣓⠯⠕⠛⠃",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣷⣴⣲⢐⣐⣟⣸⢳⢅⡝⠯⡉⠉⠀⠀⠀⠀⠀⠀",
  "⠄⠀⡀⢈⢤⠀⡖⣦⣖⡢⠾⠿⢽⣣⠨⢁⠀⢀⡔⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⡓⠒⠀⠟⠒⠊⠄⠀⠀⠀⠁⠀⠀⠀⠈⠉⠈⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
]

export function owlGrandLines(alert = false): string[] {
  return [...(alert ? OWL_GRAND_ALERT : OWL_GRAND_RESTING)]
}

// --- the owl in flight ---------------------------------------------------------

// The entrance sprite: the owl gliding in side-on, facing right, three wing
// positions cycled while it swoops down to the perch. Baked by
// scripts/generate-braille-owl.ts like the grand owl — regenerate there,
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
