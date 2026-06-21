// Design-time generator for the owl's braille stipple frames.
// Run with: npx bun scripts/generate-braille-owl.ts
//
// Renders the Athena owl as dot-density stipple art on braille cells (each
// terminal cell is a 2x4 dot grid): the perched masthead owl — ear tufts, a
// heavy brow over the eyes, talons on a branch — and the matching flight
// sprite for the startup swoop. The perched owl is sized to the flight sprite
// (12 cells wide) so the landing reads as the same bird folding its wings.
// The resting frame has sleepy crescent eyes; the alternate frame opens them
// — the owl glancing up at you — and is shown by the component on a rare
// randomized timer (and right after landing).
//
// The output frames are baked into util/athena-identity.ts as
// OWL_PERCHED_RESTING / OWL_PERCHED_ALERT / OWL_FLIGHT_FRAMES. The perched
// owl is thresholded through an ordered (Bayer) dither so its outline is a
// continuous stroke and the interior texture is even; the flight sprite, on
// screen only in motion, keeps the looser seeded-PRNG stipple. Both are fully
// deterministic — tweak the densities here, rerun, and re-bake to iterate.

const W = 24 // dot columns  (W/2 = 12 terminal columns)
const H = 24 // dot rows     (H/4 = 6 terminal rows)

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

// One blended silhouette — head over body with ear tufts — so the bird is a
// single connected form, not stacked blobs.
function silhouette(x: number, y: number): boolean {
  return (
    ell(x, y, 12, 8, 6.2, 5.8) < 1 ||
    ell(x, y, 12, 15.8, 8.6, 6.2) < 1 ||
    inTriangle(x, y, [6.4, 5.2], [9, 3], [4, 0.6]) ||
    inTriangle(x, y, [17.6, 5.2], [15, 3], [20, 0.6])
  )
}

function density(x: number, y: number, alert: boolean): number {
  let d = 0
  const head = ell(x, y, 12, 8, 6.2, 5.8)

  if (silhouette(x, y)) {
    // even, quiet texture on the body; the face stays clean so the brow,
    // eyes, and beak carry it alone
    d = head < 0.93 && y < 12.8 ? 0 : 0.12
    // the outline: a one-dot rim wherever a neighboring dot falls outside the
    // silhouette, tracing the whole bird as one continuous stroke
    for (const [nx, ny] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.75, 0.75],
      [-0.75, 0.75],
      [0.75, -0.75],
      [-0.75, -0.75],
    ]) {
      if (!silhouette(x + nx, y + ny)) d = 1
    }
    // folded wings: a stroke down each flank
    if (segDist(x, y, [6.5, 14], [8.7, 19.8]) < 0.55) d = Math.max(d, 1)
    if (segDist(x, y, [17.5, 14], [15.3, 19.8]) < 0.55) d = Math.max(d, 1)
  }

  // --- the face -------------------------------------------------------------
  // the brow: a V over the eyes, dipping from the tuft bases to the beak root
  if (segDist(x, y, [6.6, 5], [11.5, 7.4]) < 0.6) d = Math.max(d, 1)
  if (segDist(x, y, [17.4, 5], [12.5, 7.4]) < 0.6) d = Math.max(d, 1)
  for (const exOff of [-3, 3]) {
    if (alert) {
      // open: solid eyes — discs beat rings at this resolution
      if (ell(x, y, 12 + exOff, 9.8, 1.8, 1.8) < 1) d = Math.max(d, 1)
    } else {
      // resting: the sleepy crescent, an arc hugging the lower lid
      const eye = ell(x, y, 12 + exOff, 9.4, 1.8, 2)
      if (Math.abs(eye - 1) < 0.34 && y > 9.8 && y < 11.9) d = Math.max(d, 1)
    }
  }
  // beak
  if (inTriangle(x, y, [10.8, 11.8], [13.2, 11.8], [12, 14.5])) d = Math.max(d, 0.95)

  // --- the perch: a branch under the talons ---------------------------------
  if (segDist(x, y, [0.5, 23.3], [23.5, 22.3]) < 0.55) d = Math.max(d, 1)
  // talons gripping the branch, bridging the body down to it
  for (const [fx, fy] of [
    [8.5, 22],
    [15.5, 21.7],
  ]) {
    if (ell(x, y, fx, fy, 1.3, 1.1) < 1) d = Math.max(d, 1)
  }

  return d
}

// Ordered dithering for the perched owl: each density is thresholded against
// a 4x4 Bayer matrix, so full-density strokes are continuous and the sparse
// interior comes out as an even texture instead of random clumps.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

function render(alert: boolean): string[] {
  const dots: boolean[][] = []
  for (let y = 0; y < H; y++) {
    dots.push([])
    for (let x = 0; x < W; x++) {
      dots[y].push(density(x + 0.5, y + 0.5, alert) > (BAYER[y % 4][x % 4] + 0.5) / 16)
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

// --- the owl in flight --------------------------------------------------------
//
// A small companion sprite for the home-screen entrance: the owl gliding in
// side-on, facing right, on a 24x20 dot canvas (12 cells x 5 rows). Three wing
// positions — up / mid / down — cycled while the sprite swoops down to the
// perch, where the component swaps it for the grand owl above.

const FLIGHT_W = 24
const FLIGHT_H = 20

function flightDensity(x: number, y: number, wing: number): number {
  let d = 0

  // body and head, gliding posture: head a touch above the body line
  const body = ell(x, y, 14, 13, 6, 3)
  const head = ell(x, y, 20.5, 11, 3.4, 3.2)
  if (body < 1 || head < 1) {
    d = head < 0.9 ? 0.3 : 0.55
    if (Math.abs(body - 1) * 4.5 < 1.6 && head > 0.9) d = 0.9
    if (Math.abs(head - 1) * 3.3 < 1.4) d = 0.9
  }
  // solid eye on the lighter head
  if (ell(x, y, 21.5, 10.5, 1.1, 1.1) < 1) d = 1
  // beak point
  if (inTriangle(x, y, [23.2, 11], [23.2, 12.6], [25.2, 11.8])) d = Math.max(d, 0.85)

  // tail fan trailing behind
  if (inTriangle(x, y, [10, 11], [10, 15.5], [1.5, 14.5])) d = Math.max(d, 0.55)
  if (segDist(x, y, [10, 11], [1.5, 14.5]) < 0.9) d = Math.max(d, 0.85)

  // the near wing, three positions about the shoulder
  const tips: ReadonlyArray<[number, number]> = [
    [8, 0.5], // up
    [2.5, 5], // mid
    [9, 19.5], // down
  ]
  const tip = tips[wing]
  const root: [number[], number[]] = wing === 2 ? [[11, 13], [17.5, 13]] : [[10.5, 12.5], [18, 11.5]]
  if (inTriangle(x, y, root[0], root[1], tip)) d = Math.max(d, 0.55)
  // emphasized leading edge so the wing reads as a stroke, not a smudge
  if (segDist(x, y, root[1], tip) < 1) d = Math.max(d, 0.95)

  return d
}

function renderFlight(wing: number): string[] {
  const rand = prng(0x0a7e0a)
  const dots: boolean[][] = []
  for (let y = 0; y < FLIGHT_H; y++) {
    dots.push([])
    for (let x = 0; x < FLIGHT_W; x++) {
      dots[y].push(rand() < flightDensity(x + 0.5, y + 0.5, wing))
    }
  }
  const lines: string[] = []
  for (let cy = 0; cy < FLIGHT_H / 4; cy++) {
    let line = ""
    for (let cx = 0; cx < FLIGHT_W / 2; cx++) {
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
console.log("=== perched resting ===")
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

const wingNames = ["up", "mid", "down"]
const flightFrames = [0, 1, 2].map((wing) => renderFlight(wing))
for (let wing = 0; wing < 3; wing++) {
  console.log(`=== flight (${wingNames[wing]}) ===`)
  for (const line of flightFrames[wing]) console.log(line)
}
console.log("=== TS (flight) ===")
for (let wing = 0; wing < 3; wing++) {
  console.log(`  [`)
  for (const line of flightFrames[wing]) console.log(`    ${JSON.stringify(line)},`)
  console.log(`  ],`)
}
