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

/** Point-sampled gradient (Perlin-style) noise, roughly −1..1 with unit feature size. Deterministic per seed. */
export function perlin2(seed: number): (u: number, v: number) => number {
  const grad = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  return (u, v) => {
    u += 1000.5; v += 1000.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), tx = u - x0, ty = v - y0;
    const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const a = grad(x0, y0, tx, ty), b = grad(x0 + 1, y0, tx - 1, ty);
    const c = grad(x0, y0 + 1, tx, ty - 1), d = grad(x0 + 1, y0 + 1, tx - 1, ty - 1);
    const top = a + (b - a) * sx;
    return (top + (c + (d - c) * sx - top) * sy) * 1.4;
  };
}

/** Integer lattice hash in 3D → 0..1. */
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2246822519) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Point-sampled 3D gradient noise, roughly −1..1 with unit feature size. Seamless on any closed 3D surface. */
export function perlin3(seed: number): (x: number, y: number, z: number) => number {
  const grad = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => {
    // Uniform random direction from two hashes.
    const zc = hash3(ix, iy, iz, seed) * 2 - 1, a = hash3(ix, iy, iz, seed + 1) * Math.PI * 2, r = Math.sqrt(1 - zc * zc);
    return r * Math.cos(a) * dx + r * Math.sin(a) * dy + zc * dz;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z) => {
    x += 1000.5; y += 1000.5; z += 1000.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), tx = x - x0, ty = y - y0, tz = z - z0;
    const sx = fade(tx), sy = fade(ty), sz = fade(tz);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const plane = (k: number) => {
      const dz = tz - k, zk = z0 + k;
      const a = grad(x0, y0, zk, tx, ty, dz), b = grad(x0 + 1, y0, zk, tx - 1, ty, dz);
      const c = grad(x0, y0 + 1, zk, tx, ty - 1, dz), d = grad(x0 + 1, y0 + 1, zk, tx - 1, ty - 1, dz);
      return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
    };
    return lerp(plane(0), plane(1), sz) * 1.5;
  };
}

/** Fractal sum of 3D gradient noise, roughly −1..1. */
export function fbm3(seed: number, octaves: number): (x: number, y: number, z: number) => number {
  const layers = Array.from({ length: Math.max(1, Math.round(octaves)) }, (_, k) => perlin3(seed * 31 + 7 + k));
  return (x, y, z) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let k = 0; k < layers.length; k++) { s += layers[k](x * f + k * 17.3, y * f - k * 9.1, z * f + k * 5.7) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

/**
 * Gradient noise on a grid, `scale` in grid px. The lattice is rotated by `angle` so the contours don't line up
 * with the grid axes the way value noise does.
 */
export function gradientNoise(W: number, H: number, scale: number, seed: number, angle = 0): Float32Array {
  scale = Math.max(1, scale);
  const ca = Math.cos(angle) / scale, sa = Math.sin(angle) / scale, out = new Float32Array(W * H), n = perlin2(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = n(x * ca - y * sa, x * sa + y * ca);
  return out;
}

/** Fractal sum of `octaves` gradient-noise layers (each half the size and amplitude), roughly −1..1. */
export function fbm2(seed: number, octaves: number): (u: number, v: number) => number {
  const layers = Array.from({ length: Math.max(1, Math.round(octaves)) }, (_, k) => perlin2(seed * 31 + 7 + k));
  return (u, v) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let k = 0; k < layers.length; k++) { s += layers[k](u * f + k * 17.3, v * f - k * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
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

export type NoiseType = "gradient" | "ridged" | "billow" | "warped";

export const NOISE_TYPE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: "gradient", label: "Smooth" },
  { value: "ridged", label: "Ridged (sharp crests)" },
  { value: "billow", label: "Billowed (puffy)" },
  { value: "warped", label: "Domain-warped (marbled)" },
];

/**
 * Advanced noise sampler, roughly −1..1 with unit feature size for the largest octave.
 * ridged = 1 − |n| per octave (sharp crests), billow = |n| (rounded puffs),
 * warped = fractal noise sampled at a position displaced by another fractal noise (marbled swirls).
 */
export function noiseSampler(type: NoiseType, seed: number, octaves: number, warp = 1): (u: number, v: number) => number {
  const n = Math.max(1, Math.round(octaves));
  const layers = Array.from({ length: n }, (_, k) => perlin2(seed * 31 + 7 + k));
  const sum = (shape: (x: number) => number) => (u: number, v: number) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let k = 0; k < n; k++) { s += shape(layers[k](u * f + k * 17.3, v * f - k * 9.1)) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
  if (type === "ridged") { const r = sum((x) => 1 - Math.abs(x)); return (u, v) => r(u, v) * 2 - 1; }
  if (type === "billow") { const b = sum((x) => Math.abs(x)); return (u, v) => b(u, v) * 2 - 1; }
  const base = sum((x) => x);
  if (type === "warped") {
    const wx = fbm2(seed * 7 + 101, n), wy = fbm2(seed * 7 + 202, n);
    return (u, v) => base(u + warp * wx(u, v), v + warp * wy(u, v));
  }
  return base;
}
