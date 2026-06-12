// Design-time generator for the grand owl's braille stipple frames
// (docs/ui-identity-design.md). Run with: npx bun scripts/generate-braille-owl.ts
//
// Renders a great horned owl as dot-density art on a braille canvas (each
// terminal cell is a 2x4 dot grid), the way stipple illustrations work: a
// dense outline, a sparse interior, denser flanks and chest streaks, and
// eyes that are either open rings around a solid pupil or closed arcs. The
// output frames are baked into util/athena-identity.ts as OWL_GRAND_OPEN /
// OWL_GRAND_BLINK — the stipple is sampled from a seeded PRNG so a rerun
// reproduces the committed art exactly; tweak the densities here, rerun,
// and re-bake to iterate.

const W = 44 // dot columns  (W/2 = 22 terminal columns)
const H = 48 // dot rows     (H/4 = 12 terminal rows)

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

function density(x: number, y: number, blink: boolean): number {
  let d = 0

  // --- silhouette: head + body + ear tufts, perched above a branch ---------
  const head = ell(x, y, 22, 12, 11.5, 9)
  const body = ell(x, y, 22, 29, 14.5, 15.5)
  const tuftL = inTriangle(x, y, [12, 8.5], [18.5, 4], [7.5, 0])
  const tuftR = inTriangle(x, y, [32, 8.5], [25.5, 4], [36.5, 0])
  const inside = head < 1 || body < 1 || tuftL || tuftR

  if (inside) {
    // sparse interior stipple; quieter inside the face so the eyes carry it
    d = head < 0.85 ? 0.03 : 0.09

    // outline: edge distance in dots, densest right on the silhouette edge
    const edge = Math.min(Math.abs(head - 1) * 9, Math.abs(body - 1) * 15)
    if (edge < 2.2) d = Math.max(d, 0.92 * (1 - edge / 3))
    if (tuftL || tuftR) d = Math.max(d, 0.6)

    // denser flanks read as folded wings
    if (body < 1 && body > 0.76 && y > 19 && y < 40 && Math.abs(x - 22) > 8) d = Math.max(d, 0.38)

    // chest: faint vertical feather streaks
    if (body < 0.76 && y > 21 && y < 39) {
      const streak = Math.pow(Math.abs(Math.sin((x / W) * Math.PI * 9)), 8)
      d = Math.max(d, 0.04 + 0.28 * streak)
    }
  }

  // --- the face -------------------------------------------------------------
  // the horned-owl brow: a V from the tuft bases down over the eyes
  if (segDist(x, y, [15, 6.5], [20.5, 9.3]) < 0.9) d = Math.max(d, 0.85)
  if (segDist(x, y, [29, 6.5], [23.5, 9.3]) < 0.9) d = Math.max(d, 0.85)
  for (const exOff of [-5, 5]) {
    const eye = ell(x, y, 22 + exOff, 13, 2.7, 2.7)
    if (blink) {
      // closed: a lower arc, the sleepy crescent
      if (Math.abs(eye - 1) < 0.28 && y > 13.5) d = Math.max(d, 0.95)
    } else if (eye < 1) {
      d = Math.max(d, 0.95) // open: a solid round eye under the brow
    }
  }
  // beak
  if (inTriangle(x, y, [20.2, 15.5], [23.8, 15.5], [22, 19.5])) d = Math.max(d, 0.8)

  // --- the perch ------------------------------------------------------------
  if (y > 43 && y < 46.5 && x > 2 && x < 42) {
    d = Math.max(d, y < 44.5 ? 0.75 : 0.25)
  }
  // talons gripping the branch
  for (const fx of [17.5, 26.5]) {
    if (ell(x, y, fx, 42.5, 2.6, 1.8) < 1) d = Math.max(d, 0.85)
  }

  return d
}

function render(blink: boolean): string[] {
  const rand = prng(0x0a7e0a) // fixed seed: the committed art
  const dots: boolean[][] = []
  for (let y = 0; y < H; y++) {
    dots.push([])
    for (let x = 0; x < W; x++) {
      dots[y].push(rand() < density(x + 0.5, y + 0.5, blink))
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

const open = render(false)
const blink = render(true)
console.log("=== open ===")
for (const line of open) console.log(line)
console.log("=== blink ===")
for (const line of blink) console.log(line)
console.log("=== TS (open) ===")
for (const line of open) console.log(`  ${JSON.stringify(line)},`)
console.log("=== TS (blink) ===")
for (const line of blink) console.log(`  ${JSON.stringify(line)},`)
