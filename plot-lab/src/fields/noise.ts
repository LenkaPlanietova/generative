import { type Grid, type ScalarField, px, scalarField } from "../core/fields";
import { rng } from "../core/rng";

/** Smoothstep-interpolated value noise in −1..1, `scale` in grid px. */
export function valueNoise(W: number, H: number, scale: number, seed: number): Float32Array {
  scale = Math.max(1, scale);
  const R = rng(seed * 7919 + 13);
  const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2, g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = y / scale, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < W; x++) {
      const fx = x / scale, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
      const top = a + (b - a) * sx;
      out[y * W + x] = top + (c + (d - c) * sx - top) * sy;
    }
  }
  return out;
}

/** Integer lattice hash → 0..1 (deterministic, seedable). */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Gradient (Perlin-style) noise, roughly −1..1, `scale` in grid px. The lattice is rotated by `angle` so the
 * contours don't line up with the grid axes the way value noise does.
 */
export function gradientNoise(W: number, H: number, scale: number, seed: number, angle = 0): Float32Array {
  scale = Math.max(1, scale);
  const ca = Math.cos(angle) / scale, sa = Math.sin(angle) / scale, out = new Float32Array(W * H);
  const grad = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x * ca - y * sa + 1000.5, v = x * sa + y * ca + 1000.5;
      const x0 = Math.floor(u), y0 = Math.floor(v), tx = u - x0, ty = v - y0;
      const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      const a = grad(x0, y0, tx, ty), b = grad(x0 + 1, y0, tx - 1, ty);
      const c = grad(x0, y0 + 1, tx, ty - 1), d = grad(x0 + 1, y0 + 1, tx - 1, ty - 1);
      const top = a + (b - a) * sx;
      out[y * W + x] = (top + (c + (d - c) * sx - top) * sy) * 1.4;
    }
  }
  return out;
}

export interface NoiseHeightOptions {
  /** Feature size of the largest octave, mm. */
  size: number;
  octaves: number;
  seed: number;
}

/** Seeded fractal value noise as a 0..1 height field — the Phase 1 source for line direction. */
export function noiseHeight(grid: Grid, o: NoiseHeightOptions): ScalarField {
  const { width: W, height: H } = grid, out = new Float32Array(W * H);
  let amp = 1, scale = px(grid, o.size);
  for (let k = 0; k < Math.max(1, Math.round(o.octaves)); k++) {
    const n = gradientNoise(W, H, scale, o.seed * 31 + 101 + k, 0.61 + k * 1.37);
    for (let i = 0; i < n.length; i++) out[i] += n[i] * amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  let mn = Infinity, mx = -Infinity;
  for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const r = mx - mn || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / r;
  return scalarField(grid, out);
}
