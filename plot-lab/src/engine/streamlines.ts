/**
 * Evenly spaced streamlines with variable separation (Jobard & Lefer 1997).
 * Ported from reference/js/streamlines.worker.js — keep behaviour identical; test/parity.test.ts checks it.
 *
 * Consumes any DirectionField + tone ScalarField on the same grid. Parameters are millimetres / degrees and
 * are converted to grid pixels here via `mmPerPx`. Output paths are in grid px.
 */
import { type DirectionField, type ScalarField, sameSize, sample } from "../core/fields";
import type { Path } from "../core/path";
import { rng } from "../core/rng";

export type SeedOrder = "dark" | "center" | "random";

export interface StreamlineParams {
  /** Line spacing in the darkest areas (tone 0), mm. */
  darkestSpacing: number;
  /** Line spacing in the lightest areas (tone 1), mm. */
  lightestSpacing: number;
  /** spacing = darkest + (lightest − darkest) · tone^gamma */
  gamma: number;
  /** A line stops when it comes closer than clearance × spacing to another line. */
  clearance: number;
  /** mm */
  minLength: number;
  /** mm */
  maxLength: number;
  /** Max turn per integration step, degrees — stops lines at singularities. */
  maxTurn: number;
  /** Integration step, × darkest spacing. */
  stepSize: number;
  seedOrder: SeedOrder;
  /** No lines where tone is above this. */
  whiteCut: number;
  seed: number;
}

export interface StreamlineInput {
  direction: DirectionField;
  tone: ScalarField;
  mmPerPx: number;
  params: StreamlineParams;
  /** Called with newly accepted lines roughly every `batchMs` and once at the end. */
  onBatch?: (lines: Path[], progress: number) => void;
  batchMs?: number;
  now?: () => number;
}

export interface StreamlineResult {
  lines: Path[];
  /** Integration step, grid px. */
  step: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function traceStreamlines(input: StreamlineInput): StreamlineResult {
  const { direction, tone: toneField, mmPerPx, params: p } = input;
  if (!sameSize(direction, toneField)) throw new Error("Direction and tone fields must share a grid");
  const W = direction.width, H = direction.height;
  const { c, s } = direction, tone = toneField.data;
  const now = input.now ?? (() => performance.now()), batchMs = input.batchMs ?? 140, onBatch = input.onBatch;

  const toPx = 1 / mmPerPx;
  const dMin = p.darkestSpacing * toPx, dMax = Math.max(p.lightestSpacing, p.darkestSpacing + 0.05) * toPx;
  const gam = p.gamma, ratio = p.clearance;
  const step = Math.max(0.25, dMin * p.stepSize);
  const minSteps = (p.minLength * toPx) / step, maxSteps = Math.max(10, (p.maxLength * toPx) / step);
  const cosTurn = Math.cos((p.maxTurn * Math.PI) / 180), white = p.whiteCut;

  // Spatial hash of accepted points, cell = largest separation, so a 3×3 lookup covers any test radius.
  const cell = dMax, gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  type Hash = (number[] | undefined)[];
  const grid: Hash = new Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = [];

  const S = (a: Float32Array, x: number, y: number) => sample(a, W, H, x, y);
  const sep = (x: number, y: number) => dMin + (dMax - dMin) * Math.pow(S(tone, x, y), gam);

  let dirx = 0, diry = 0;
  /** Unit direction at (x, y), flipped to agree with (px, py). Writes dirx/diry. */
  function dir(x: number, y: number, px: number, py: number): boolean {
    const cc = S(c, x, y), ss = S(s, x, y);
    if (cc * cc + ss * ss < 1e-20) return false;
    const th = 0.5 * Math.atan2(ss, cc);
    let dx = Math.cos(th), dy = Math.sin(th);
    if (px * dx + py * dy < 0) { dx = -dx; dy = -dy; }
    dirx = dx; diry = dy;
    return true;
  }
  const inside = (x: number, y: number) => x >= 1 && x < W - 2 && y >= 1 && y < H - 2;

  function hit(g: Hash, x: number, y: number, r: number): boolean {
    const gx = (x / cell) | 0, gy = (y / cell) | 0, r2 = r * r;
    for (let j = gy - 1; j <= gy + 1; j++) {
      if (j < 0 || j >= gh) continue;
      for (let i = gx - 1; i <= gx + 1; i++) {
        if (i < 0 || i >= gw) continue;
        const a = g[j * gw + i];
        if (!a) continue;
        for (let k = 0; k < a.length; k += 2) {
          const dx = a[k] - x, dy = a[k + 1] - y;
          if (dx * dx + dy * dy < r2) return true;
        }
      }
    }
    return false;
  }
  function put(g: Hash, x: number, y: number): void {
    const k = ((y / cell) | 0) * gw + ((x / cell) | 0);
    (g[k] || (g[k] = [])).push(x, y);
  }

  // Own points join the self-collision hash only once they are this many steps behind the head.
  const skip = Math.ceil((2.5 * dMax) / step) + 2;

  /** RK2 (midpoint) integration from (x, y) along (d0x, d0y); appends points to `out`. */
  function march(x: number, y: number, d0x: number, d0y: number, own: Hash, out: number[]): void {
    let px = d0x, py = d0y;
    const pend: number[] = [];
    for (let it = 0; it < maxSteps; it++) {
      if (!dir(x, y, px, py)) break;
      const ax = dirx, ay = diry;
      if (!dir(x + ax * step * 0.5, y + ay * step * 0.5, ax, ay)) break;
      const bx = dirx, by = diry;
      if (bx * px + by * py < cosTurn) break;
      const nx = x + bx * step, ny = y + by * step;
      if (!inside(nx, ny)) break;
      if (S(tone, nx, ny) > white) break;
      const r = sep(nx, ny) * ratio;
      if (hit(grid, nx, ny, r) || hit(own, nx, ny, r)) break;
      out.push(nx, ny);
      pend.push(nx, ny);
      if (pend.length > skip * 2) { put(own, pend[0], pend[1]); pend.splice(0, 2); }
      x = nx; y = ny; px = bx; py = by;
    }
  }

  /** Trace both directions from a seed; null if the seed is blocked or the line is too short. */
  function line(x: number, y: number): Path | null {
    if (!inside(x, y) || S(tone, x, y) > white) return null;
    if (hit(grid, x, y, sep(x, y) * Math.min(0.95, ratio * 1.6))) return null;
    if (!dir(x, y, 0, 0)) return null;
    const d0x = dirx, d0y = diry;
    const own: Hash = [], f: number[] = [], b: number[] = [];
    march(x, y, d0x, d0y, own, f);
    for (let k = skip * 2; k < f.length; k += 2) put(own, f[k], f[k + 1]);
    march(x, y, -d0x, -d0y, own, b);
    const n = (f.length + b.length) / 2 + 1;
    if (n < minSteps || n < 3) return null;
    const pts = new Float32Array(n * 2);
    let o = 0;
    for (let k = b.length - 2; k >= 0; k -= 2) { pts[o++] = b[k]; pts[o++] = b[k + 1]; }
    pts[o++] = x; pts[o++] = y;
    for (let k = 0; k < f.length; k++) pts[o++] = f[k];
    return pts;
  }

  const lines: Path[] = [];
  let batch: Path[] = [];
  const queue: number[] = [];
  let qh = 0;
  const stride = Math.max(1, Math.round(dMin / step));
  function accept(pts: Path): void {
    for (let k = 0; k < pts.length; k += 2) put(grid, pts[k], pts[k + 1]);
    lines.push(pts);
    batch.push(pts);
    // Candidate seeds one separation away on both sides of the new line (FIFO).
    for (let k = 0; k < pts.length - 2; k += 2 * stride) {
      const x = pts[k], y = pts[k + 1], tx = pts[k + 2] - x, ty = pts[k + 3] - y;
      const l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, d = sep(x, y);
      queue.push(x + nx * d, y + ny * d, x - nx * d, y - ny * d);
    }
  }

  // Fallback seeds: a jittered grid over the whole field, so every region gets lines.
  const R = rng(p.seed), g = Math.max(2, dMax * 0.9), cand: [number, number, number][] = [];
  for (let y = g / 2; y < H; y += g) {
    for (let x = g / 2; x < W; x += g) {
      const jx = x + (R() - 0.5) * g * 0.6, jy = y + (R() - 0.5) * g * 0.6;
      let key: number;
      if (p.seedOrder === "dark") key = S(tone, jx, jy);
      else if (p.seedOrder === "center") key = Math.hypot(jx - W / 2, jy - H / 2);
      else key = R();
      cand.push([key, jx, jy]);
    }
  }
  cand.sort((a, b) => a[0] - b[0]);

  let ci = 0, lastPost = now();
  while (true) {
    if (qh < queue.length) {
      const x = queue[qh++], y = queue[qh++];
      const L = line(x, y);
      if (L) accept(L);
    } else {
      if (ci >= cand.length) break;
      const L = line(cand[ci][1], cand[ci][2]);
      ci++;
      if (L) accept(L);
    }
    if (qh > 200000) { queue.splice(0, qh); qh = 0; }
    if (onBatch) {
      const t = now();
      if (t - lastPost > batchMs) { lastPost = t; onBatch(batch, ci / cand.length); batch = []; }
    }
  }
  onBatch?.(batch, 1);
  return { lines, step };
}

/** Line spacing (mm) as a function of tone — for UI hints and tests. */
export function spacingAt(p: StreamlineParams, tone: number): number {
  const dMax = Math.max(p.lightestSpacing, p.darkestSpacing + 0.05);
  return p.darkestSpacing + (dMax - p.darkestSpacing) * Math.pow(clamp(tone, 0, 1), p.gamma);
}
