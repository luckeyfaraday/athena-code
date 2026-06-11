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
