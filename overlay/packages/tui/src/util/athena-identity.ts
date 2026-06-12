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

// The full perched owl for the home screen when the terminal is tall enough:
// ear tufts, brow, eyes (the blink rows), beak, folded wings over a feathered
// chest, tail, perch. Every line is padded to the same width so a centering
// container cannot shear rows of different parity. Rendered by
// component/athena-owl.tsx, which lights the face rows brighter than the body.
export const OWL_GRAND_FACE_ROWS: ReadonlyArray<number> = [2, 3]

export function owlGrandLines(blink = false): string[] {
  const eyes = blink ? "( -   - )" : "( o   o )"
  return [
    "  ,_,   ,_,  ",
    "  \\ \\___/ /  ",
    `  ${eyes}  `,
    "   (  v  )   ",
    "  /|`---'|\\  ",
    " ( |^ ^ ^| ) ",
    "  \\|^ ^ ^|/  ",
    "    |___|    ",
    `   -"---"-   `,
  ]
}
