// Tests for the command-room voice helpers and the owl's pure frame function
// (util/athena-identity.ts).

import { expect, test } from "bun:test"
import {
  APHORISMS,
  WORKING_VERBS,
  dailyAphorism,
  flightScene,
  OWL_FLIGHT_FRAMES,
  OWL_FLIGHT_HEIGHT,
  OWL_FLIGHT_WIDTH,
  owlFlightFrame,
  OWL_PERCHED_FACE_ROWS,
  owlPerchedLines,
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

test("the perched owl is uniform-width braille stipple art, and glances up", () => {
  const resting = owlPerchedLines()
  const width = resting[0].length
  expect(resting.every((line) => line.length === width)).toBe(true)
  // The perched owl shares the flight sprite's width so the landing reads as
  // the same bird folding its wings.
  expect(width).toBe(OWL_FLIGHT_WIDTH)
  // Every glyph is a braille cell (U+2800–U+28FF) so the stipple renders as
  // dot-matrix art in any font that has the braille block.
  for (const line of resting) {
    for (const glyph of line) {
      const code = glyph.charCodeAt(0)
      expect(code).toBeGreaterThanOrEqual(0x2800)
      expect(code).toBeLessThanOrEqual(0x28ff)
    }
  }
  const alert = owlPerchedLines(true)
  expect(alert.length).toBe(resting.length)
  expect(alert.every((line) => line.length === width)).toBe(true)
  // Opening the eyes changes the face and nothing else.
  expect(alert.join("\n")).not.toBe(resting.join("\n"))
  for (let row = 0; row < resting.length; row++) {
    if (resting[row] === alert[row]) continue
    expect(OWL_PERCHED_FACE_ROWS).toContain(row)
  }
  for (const row of OWL_PERCHED_FACE_ROWS) expect(row).toBeLessThan(resting.length)
})

test("the flight frames are uniform braille sprites cycling up-mid-down-mid", () => {
  expect(OWL_FLIGHT_FRAMES.length).toBe(3)
  for (const frame of OWL_FLIGHT_FRAMES) {
    expect(frame.length).toBe(OWL_FLIGHT_HEIGHT)
    for (const line of frame) {
      expect(line.length).toBe(OWL_FLIGHT_WIDTH)
      for (const glyph of line) {
        const code = glyph.charCodeAt(0)
        expect(code).toBeGreaterThanOrEqual(0x2800)
        expect(code).toBeLessThanOrEqual(0x28ff)
      }
    }
  }
  // The wing beat: up, mid, down, mid, and around again.
  expect(owlFlightFrame(0)).toBe(OWL_FLIGHT_FRAMES[0])
  expect(owlFlightFrame(1)).toBe(OWL_FLIGHT_FRAMES[1])
  expect(owlFlightFrame(2)).toBe(OWL_FLIGHT_FRAMES[2])
  expect(owlFlightFrame(3)).toBe(OWL_FLIGHT_FRAMES[1])
  expect(owlFlightFrame(4)).toBe(OWL_FLIGHT_FRAMES[0])
})

test("the flight scene places the sprite and clips cleanly at every edge", () => {
  const sprite = ["ab", "cd"]
  // Fully on canvas.
  expect(flightScene(5, 4, 1, 1, sprite)).toEqual(["     ", " ab  ", " cd  ", "     "])
  // Entering from off-screen left and top.
  expect(flightScene(5, 3, -1, -1, sprite)).toEqual(["d    ", "     ", "     "])
  // Leaving past the right edge.
  expect(flightScene(3, 2, 2, 0, sprite)).toEqual(["  a", "  c"])
  // Entirely off canvas still yields a blank scene of the right size.
  const blank = flightScene(4, 2, 10, 0, sprite)
  expect(blank).toEqual(["    ", "    "])
  // Every row is always exactly `width` cells so the layout never shifts.
  for (const row of flightScene(30, 16, 7, 5, [...OWL_FLIGHT_FRAMES[1]])) {
    expect(row.length).toBe(30)
  }
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

