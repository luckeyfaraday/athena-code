// Design-time generator for the grand owl's braille stipple frames
// (docs/ui-identity-design.md). Run with: npx bun scripts/generate-braille-owl.ts
//
// Renders a great horned owl as dot-density stipple art on a braille canvas
// (each terminal cell is a 2x4 dot grid), after the classic pointillist owl
// illustrations: no hard outline — shape comes from density alone — a tall
// slender body with a long folded wing, chest streaks, pointed ear tufts, a
// heavy brow over sleepy crescent eyes, perched on a diagonal branch. The
// resting frame has the eyes closed to crescents; the alternate frame opens
// them — the owl glancing up at you — and is shown by the component on the
// same rare randomized timer the companion owl blinks on.
//
// The output frames are baked into util/athena-identity.ts as
// OWL_GRAND_RESTING / OWL_GRAND_ALERT — the stipple is sampled from a seeded
// PRNG so a rerun reproduces the committed art exactly; tweak the densities
// here, rerun, and re-bake to iterate.

const W = 60 // dot columns  (W/2 = 30 terminal columns)
const H = 64 // dot rows     (H/4 = 16 terminal rows)

// mulberry32 — tiny seeded PRNG so the art is reproducible.
function prng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Normalized radial distance to an ellipse in dot space: <1 inside, 1 on edge.
function ell(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return Math.sqrt(dx * dx + dy * dy)
}

function inTriangle(x: number, y: number, a: number[], b: number[], c: number[]) {
  const s = (p: number[], q: number[]) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1])
  const d1 = s(a, b)
  const d2 = s(b, c)
  const d3 = s(c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

// Distance from a point to a line segment, in dots.
function segDist(x: number, y: number, a: number[], b: number[]) {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)))
  const px = a[0] + t * vx
  const py = a[1] + t * vy
  return Math.hypot(x - px, y - py)
}

function density(x: number, y: number, alert: boolean): number {
  let d = 0

  // --- silhouette: head, tall body, tail — form from edge-weighted density --
  const head = ell(x, y, 30, 13, 17, 11)
  const body = ell(x, y, 30, 35, 19, 18)
  const tail = ell(x, y, 31, 53, 10, 8.5)
  const tuftL = inTriangle(x, y, [14, 9.5], [23, 4], [9, 0])
  const tuftR = inTriangle(x, y, [46, 9.5], [37, 4], [51, 0])
  const inside = head < 1 || body < 1 || tail < 1 || tuftL || tuftR

  if (inside) {
    // sparse interior, quietest inside the face so the eyes carry it
    d = head < 0.9 ? 0.05 : 0.12
    const shapes: Array<[number, number]> = [
      [head, 12],
      [body, 18.5],
      [tail, 9],
    ]
    for (const [sd, r] of shapes) {
      const edge = Math.abs(sd - 1) * r
      if (edge < 3) {
        // skip internal seams where one shape's edge is buried in another
        const buried =
          (sd === head && body < 0.9) || (sd === body && (head < 0.9 || tail < 0.85)) || (sd === tail && body < 0.85)
        if (!buried) d = Math.max(d, 0.85 * (1 - edge / 3.5))
      }
    }
    if (tuftL || tuftR) d = Math.max(d, 0.55)

    // the long folded wing down the owl's right flank, with feather edges
    if (body < 1 && x > 37 && y > 22 && y < 50) {
      d = Math.max(d, 0.18)
      const phase = (x - 37 - (y - 22) * 0.35) % 5.5
      if (phase >= 0 && phase < 1.1) d = Math.max(d, 0.5)
    }

    // chest: faint vertical feather streaks on the owl's left
    if (body < 0.85 && x <= 37 && y > 23 && y < 48) {
      const streak = Math.pow(Math.abs(Math.sin((x / W) * Math.PI * 10)), 8)
      d = Math.max(d, 0.04 + 0.28 * streak)
    }
  }

  // --- the face -------------------------------------------------------------
  // heavy brow: a wide V from the tuft bases down between the eyes
  if (segDist(x, y, [17, 7.5], [26.5, 11.5]) < 1.2) d = Math.max(d, 0.9)
  if (segDist(x, y, [43, 7.5], [33.5, 11.5]) < 1.2) d = Math.max(d, 0.9)
  for (const exOff of [-7, 7]) {
    const eye = ell(x, y, 30 + exOff, 14, 4.2, 4.2)
    if (alert) {
      if (Math.abs(eye - 1) < 0.19) d = Math.max(d, 0.95) // open ring
      if (eye < 0.4) d = Math.max(d, 0.95) // pupil
    } else {
      // resting: the sleepy crescent, an arc hugging the lower lid
      if (Math.abs(eye - 1) < 0.22 && y > 14 && y < 18.5) d = Math.max(d, 0.95)
    }
  }
  // beak
  if (inTriangle(x, y, [28.3, 19.5], [31.7, 19.5], [30, 24])) d = Math.max(d, 0.7)

  // --- the perch: a diagonal branch, the tail hanging past it ---------------
  const branchD = segDist(x, y, [1, 62], [59, 48])
  if (branchD < 1.8) d = Math.max(d, 0.6)
  else if (branchD < 4 && y > 50) d = Math.max(d, 0.08)
  // talons gripping the branch
  for (const [fx, fy] of [
    [24, 55.5],
    [35, 52.5],
  ]) {
    if (ell(x, y, fx, fy, 2.6, 2) < 1) d = Math.max(d, 0.85)
  }

  return d
}

function render(alert: boolean): string[] {
  const rand = prng(0x0a7e0a) // fixed seed: the committed art
  const dots: boolean[][] = []
  for (let y = 0; y < H; y++) {
    dots.push([])
    for (let x = 0; x < W; x++) {
      dots[y].push(rand() < density(x + 0.5, y + 0.5, alert))
    }
  }
  const lines: string[] = []
  for (let cy = 0; cy < H / 4; cy++) {
    let line = ""
    for (let cx = 0; cx < W / 2; cx++) {
      let bits = 0
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          if (!dots[cy * 4 + dy][cx * 2 + dx]) continue
          bits |= 1 << (dy < 3 ? dx * 3 + dy : 6 + dx)
        }
      }
      line += String.fromCharCode(0x2800 + bits)
    }
    lines.push(line)
  }
  return lines
}

const resting = render(false)
const alert = render(true)
console.log("=== resting ===")
for (const line of resting) console.log(line)
console.log("=== alert ===")
for (const line of alert) console.log(line)
console.log("=== TS (resting) ===")
for (const line of resting) console.log(`  ${JSON.stringify(line)},`)
console.log("=== TS (alert) ===")
for (const line of alert) console.log(`  ${JSON.stringify(line)},`)
const diff: number[] = []
for (let i = 0; i < resting.length; i++) if (resting[i] !== alert[i]) diff.push(i)
console.log(`=== rows differing between frames: [${diff.join(", ")}] ===`)
