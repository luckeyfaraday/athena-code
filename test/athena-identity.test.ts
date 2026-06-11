// Tests for the command-room voice helpers and the owl's pure frame function
// (util/athena-identity.ts).

import { expect, test } from "bun:test"
import {
  APHORISMS,
  WORKING_VERBS,
  dailyAphorism,
  markLines,
  owlLines,
  verbSeed,
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
  expect(owlLines("idle")).toEqual(["(o,o)", " /)_)"])
  expect(owlLines("idle", true)[0]).toBe("(-,-)")
  expect(owlLines("thinking")[0]).toBe("(-,-)")
  expect(owlLines("working", false, true)[1]).toBe(" /)_)~")
  expect(owlLines("working", false, false)[1]).toBe(" /)_)")
})
