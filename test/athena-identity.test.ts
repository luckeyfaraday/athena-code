// Tests for the command-room voice helpers and the owl's pure frame function
// (util/athena-identity.ts).

import { expect, test } from "bun:test"
import {
  APHORISMS,
  WORKING_VERBS,
  dailyAphorism,
  markLines,
  meanderLine,
  OWL_FACE_ROW,
  OWL_GRAND_FACE_ROWS,
  owlGrandLines,
  owlLines,
  verbSeed,
  WEAVE_BARE,
  WEAVE_SHUTTLE,
  WEAVE_WOVEN,
  weaveFrames,
  workingVerb,
} from "../overlay/packages/tui/src/util/athena-identity"

test("working verbs rotate through the whole lexicon and never go out of range", () => {
  const seen = new Set<string>()
  for (let tick = 0; tick < WORKING_VERBS.length * 2; tick++) {
    seen.add(workingVerb(verbSeed("ses_abc123") + tick))
  }
  expect(seen.size).toBe(WORKING_VERBS.length)
  expect(workingVerb(-7)).toBeDefined()
})

test("verb seed is stable and differs across sessions", () => {
  expect(verbSeed("ses_one")).toBe(verbSeed("ses_one"))
  expect(verbSeed("ses_one")).not.toBe(verbSeed("ses_two"))
})

test("the daily aphorism is stable within a day and attributed", () => {
  const noon = new Date("2026-06-11T12:00:00Z")
  const evening = new Date("2026-06-11T22:00:00Z")
  const tomorrow = new Date("2026-06-12T12:00:00Z")
  expect(dailyAphorism(noon)).toEqual(dailyAphorism(evening))
  expect(dailyAphorism(tomorrow)).not.toEqual(dailyAphorism(noon))
  for (const maxim of APHORISMS) {
    expect(maxim.text.length).toBeGreaterThan(0)
    expect(maxim.source.length).toBeGreaterThan(0)
  }
})

test("the mark blooms six spokes around a hollow centre", () => {
  const full = markLines(3)
  expect(full.length).toBe(7)
  expect(full.every((line) => line.length === 13)).toBe(true)
  expect(full[3][6]).toBe(" ") // hollow centre
  expect(full[0][6]).toBe("|") // vertical spokes fully grown
  expect(full[0][0]).toBe("\\") // diagonals reach the corners
  // Partially grown marks stay inside the same canvas.
  expect(markLines(1).length).toBe(7)
  expect(markLines(1)[0].trim()).toBe("")
  // Compact mark for short terminals.
  const compact = markLines(2, 2)
  expect(compact.length).toBe(5)
  expect(compact.every((line) => line.length === 9)).toBe(true)
})

test("owl frames cover idle, blink, thinking, and working ticks", () => {
  expect(owlLines("idle")).toEqual([",___,", "(o,o)", "/)_)", `-"-"-`])
  expect(owlLines("idle", true)[OWL_FACE_ROW]).toBe("(-,-)")
  expect(owlLines("thinking")[OWL_FACE_ROW]).toBe("(-,-)")
  expect(owlLines("working", false, true)[2]).toBe("/)_)~")
  expect(owlLines("working", false, false)[2]).toBe("/)_)")
})

test("the grand owl is uniform width so centering cannot shear it, and blinks", () => {
  const open = owlGrandLines()
  const width = open[0].length
  expect(open.every((line) => line.length === width)).toBe(true)
  const blink = owlGrandLines(true)
  expect(blink.length).toBe(open.length)
  // Only the eye row changes between open and blinking frames.
  for (let row = 0; row < open.length; row++) {
    if (open[row] === blink[row]) continue
    expect(OWL_GRAND_FACE_ROWS).toContain(row)
    expect(blink[row]).toContain("-")
  }
  expect(open.join("\n")).toContain("( o   o )")
  expect(blink.join("\n")).toContain("( -   - )")
  for (const row of OWL_GRAND_FACE_ROWS) expect(row).toBeLessThan(open.length)
})

test("the weave shuttles across the warp, holds at each selvedge, and returns", () => {
  const frames = weaveFrames(8, 5, 3)
  expect(frames.length).toBe(8 + 3 + 7 + 5)
  // Every frame is the same width with exactly one shuttle.
  for (const frame of frames) {
    expect(frame.length).toBe(8)
    expect([...frame].filter((glyph) => glyph === WEAVE_SHUTTLE).length).toBe(1)
  }
  // Outbound: woven thread behind the shuttle, bare warp ahead.
  expect(frames[0]).toBe(WEAVE_SHUTTLE + WEAVE_BARE.repeat(7))
  expect(frames[3]).toBe(WEAVE_WOVEN.repeat(3) + WEAVE_SHUTTLE + WEAVE_BARE.repeat(4))
  // Hold at the far selvedge with the row fully woven.
  expect(frames[8]).toBe(WEAVE_WOVEN.repeat(7) + WEAVE_SHUTTLE)
  expect(frames[10]).toBe(frames[8])
  // Return travels home along the finished row.
  expect(frames[11]).toBe(WEAVE_WOVEN.repeat(6) + WEAVE_SHUTTLE + WEAVE_WOVEN)
  // Home hold starts the next bare row.
  expect(frames.at(-1)).toBe(WEAVE_SHUTTLE + WEAVE_BARE.repeat(7))
})

test("the meander rule walks the Greek key and ends clean on 4k+1 widths", () => {
  expect(meanderLine(9)).toBe("─┐ ┌─┐ ┌─")
  expect(meanderLine(33).startsWith("─┐ ┌─")).toBe(true)
  expect(meanderLine(33).endsWith("─")).toBe(true)
  expect(meanderLine(33).length).toBe(33)
})
