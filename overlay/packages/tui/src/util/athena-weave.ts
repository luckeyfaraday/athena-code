// The weave — Athena's working animation,
// replacing the upstream knight-rider scanner via a swap hunk in
// component/prompt/index.tsx. Frame strings come from athena-identity.ts;
// this file maps each glyph to a color: the shuttle carries the full agent
// color, the woven thread keeps just over half of it, the bare warp a trace.

import { RGBA, type ColorInput } from "@opentui/core"
import type { ColorGenerator } from "opentui-spinner"
import { weaveFrames, WEAVE_SHUTTLE, WEAVE_WOVEN } from "./athena-identity"

export const WEAVE_INTERVAL_MS = 100

const WOVEN_ALPHA = 0.55
const BARE_ALPHA = 0.22

function toRGBA(color: ColorInput): RGBA {
  return color instanceof RGBA ? color : RGBA.fromHex(color as string)
}

export interface WeaveSpinner {
  frames: string[]
  color: ColorGenerator
  interval: number
}

export function weaveSpinner(color: ColorInput): WeaveSpinner {
  const frames = weaveFrames()
  const bright = toRGBA(color)
  const woven = RGBA.fromValues(bright.r, bright.g, bright.b, WOVEN_ALPHA)
  const bare = RGBA.fromValues(bright.r, bright.g, bright.b, BARE_ALPHA)
  const generator: ColorGenerator = (frameIndex, charIndex) => {
    const glyph = frames[frameIndex]?.[charIndex]
    if (glyph === WEAVE_SHUTTLE) return bright
    if (glyph === WEAVE_WOVEN) return woven
    return bare
  }
  return { frames, color: generator, interval: WEAVE_INTERVAL_MS }
}
