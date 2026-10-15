import { type DirectionField, type Grid, type ScalarField, px } from "../core/fields";
import { blur } from "../core/blur";
import { valueNoise } from "./noise";

/** Field shaping shared by every height-based direction source. Sizes in mm, angles in degrees. */
export interface DirectionOptions {
  /** Detail smoothing: scale of the local tensor (eyelids, lips…). */
  detail: number;
  /** Swirl size: scale of the overall-form tensor. */
  swirlSize: number;
  /** Swirl strength: weight of the swirl tensor relative to detail. */
  swirlStrength: number;
  /** Direction offset: 0° = along contours, 90° = down the slopes. */
  offset: number;
  /** Wobble amount: max random rotation. */
  wobble: number;
  /** Wobble size: feature size of the wobble noise. */
  wobbleSize: number;
  seed: number;
}

/** Normalised structure tensor [Jxx, Jyy, Jxy] at one scale (sigma in grid px). */
function tensor(d: Float32Array, W: number, H: number, sigma: number): [Float32Array, Float32Array, Float32Array] {
  const b = blur(d, W, H, sigma), n = W * H;
  const xx = new Float32Array(n), yy = new Float32Array(n), xy = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = (b[y * W + Math.min(x + 1, W - 1)] - b[y * W + Math.max(x - 1, 0)]) * 0.5;
      const gy = (b[Math.min(y + 1, H - 1) * W + x] - b[Math.max(y - 1, 0) * W + x]) * 0.5;
      xx[i] = gx * gx; yy[i] = gy * gy; xy[i] = gx * gy;
    }
  }
  const XX = blur(xx, W, H, sigma), YY = blur(yy, W, H, sigma), XY = blur(xy, W, H, sigma);
  let m = 0;
  for (let i = 0; i < n; i++) m += XX[i] + YY[i];
  m = m / n + 1e-12;
  for (let i = 0; i < n; i++) { XX[i] /= m; YY[i] /= m; XY[i] /= m; }
  return [XX, YY, XY];
}

/**
 * Direction field from a height map (noise, image brightness, depth…): blend the structure tensor at two
 * scales and store it in double-angle form, rotated 90° so lines run along contours.
 */
export function directionFromHeight(heightField: ScalarField, grid: Grid, o: DirectionOptions): DirectionField {
  const { width: W, height: H, data: h } = heightField, n = W * H;
  const A = tensor(h, W, H, px(grid, o.detail)), B = tensor(h, W, H, px(grid, o.swirlSize)), gw = o.swirlStrength;
  const c = new Float32Array(n), s = new Float32Array(n);
  const off = (o.offset * Math.PI) / 90, co = Math.cos(off), so = Math.sin(off); // double-angle rotation
  const noise = o.wobble > 0 ? valueNoise(W, H, px(grid, o.wobbleSize), o.seed) : null, na = (o.wobble * Math.PI) / 90;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const xx = A[0][i] + gw * B[0][i], yy = A[1][i] + gw * B[1][i], xy = A[2][i] + gw * B[2][i];
    let cc = -(xx - yy), ss = -2 * xy;
    let r = cc * co - ss * so; ss = cc * so + ss * co; cc = r;
    if (noise) {
      const a = noise[i] * na, ca = Math.cos(a), sa = Math.sin(a);
      r = cc * ca - ss * sa; ss = cc * sa + ss * ca; cc = r;
    }
    c[i] = cc; s[i] = ss; mean += Math.hypot(cc, ss);
  }
  mean /= n;
  const eps = mean * 0.02;
  for (let i = 0; i < n; i++) c[i] -= eps; // flat areas fall back to vertical lines
  return { width: W, height: H, c, s };
}
