/**
 * Image flow core shared by Redraw and Contour Portrait (SPEC_ADDENDUM §D).
 * Direction = structure tensor of the image (or of a depth map plus photo relief), two scales blended, in
 * double-angle form rotated 90° so lines run along strokes / contours. Tone = blurred brightness, stretched.
 * Follows reference/python/redraw_from_lineart.py (Sobel gradients, separate pre-blur, percentile tone stretch).
 */
import { blur } from "../core/blur";
import type { DirectionField, Grid, ScalarField } from "../core/fields";
import { gridToMm } from "../core/path";
import type { Sheet } from "../core/paper";
import { valueNoise } from "../fields/noise";
import { type SeedOrder, traceStreamlines } from "../engine/streamlines";
import { fromFlat } from "../geometry/convert";
import { DEFAULT_LAYER, type GeometryCollection, type PlotPath } from "../geometry/types";
import { type ImageAdjust, sampleImage } from "../image/sampler";
import type { GrayImage } from "../image/types";

export interface ImageFlowOptions {
  photo: GrayImage;
  depth?: GrayImage;
  /** Share of photo brightness mixed into the depth for direction (0..1). */
  relief: number;
  adjust: ImageAdjust;
  /** Grid cells along the long side. */
  resolution: number;
  /** mm */
  preBlur: number;
  detail: number;
  swirlSize: number;
  swirlStrength: number;
  toneBlur: number;
  /** Brightness that counts as paper white in the tone stretch. */
  whitePoint: number;
  /** Local-contrast boost of the tone (unsharp mask), 0 = off. */
  detailBoost: number;
  /** How much image edges darken the tone (more lines along features), 0 = off. */
  edgeSensitivity: number;
  /** degrees */
  offset: number;
  wobble: number;
  wobbleSize: number;
  /** Fall back to vertical lines where the field is flat (portraits); off for line art. */
  flatFallback: boolean;
}

function sobel(b: Float32Array, W: number, H: number): [Float32Array, Float32Array] {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const ym = (y > 0 ? y - 1 : 1 < H ? 1 : 0) * W, yc = y * W, yp = (y < H - 1 ? y + 1 : Math.max(0, H - 2)) * W; // reflect edges
    for (let x = 0; x < W; x++) {
      const xm = x > 0 ? x - 1 : Math.min(1, W - 1), xp = x < W - 1 ? x + 1 : Math.max(0, W - 2);
      gx[yc + x] = b[ym + xp] + 2 * b[yc + xp] + b[yp + xp] - b[ym + xm] - 2 * b[yc + xm] - b[yp + xm];
      gy[yc + x] = b[yp + xm] + 2 * b[yp + x] + b[yp + xp] - b[ym + xm] - 2 * b[ym + x] - b[ym + xp];
    }
  }
  return [gx, gy];
}

function percentile(a: Float32Array, q: number): number {
  const step = Math.max(1, Math.floor(a.length / 200_000)), s: number[] = [];
  for (let i = 0; i < a.length; i += step) s.push(a[i]);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function imageFlowFields(sheet: Sheet, o: ImageFlowOptions, seed: number): { grid: Grid; direction: DirectionField; tone: ScalarField; luma: ScalarField } {
  const a = sheet.area, mmPerPx = Math.max(a.width, a.height) / o.resolution;
  const W = Math.max(8, Math.round(a.width / mmPerPx)), H = Math.max(8, Math.round(a.height / mmPerPx)), n = W * H;
  const grid: Grid = { width: W, height: H, mmPerPx };
  const sg = { W, H, x0: a.x, y0: a.y, sx: mmPerPx, sy: mmPerPx }, px = (mm: number) => mm / mmPerPx;
  const L = sampleImage(o.photo, a, sg, o.adjust, 1);

  // Tone: blurred brightness, stretched from the 1st percentile to the white point.
  let t = blur(L, W, H, px(o.toneBlur));
  const luma = o.detailBoost > 0 ? t.slice() : t; // blurred brightness before the stretch
  if (o.detailBoost > 0) {
    const base = blur(t, W, H, px(3));
    for (let i = 0; i < n; i++) t[i] = t[i] + o.detailBoost * (t[i] - base[i]);
  }
  const lo = percentile(t, 0.01), span = Math.max(1e-6, o.whitePoint - lo), tone = new Float32Array(n);
  for (let i = 0; i < n; i++) tone[i] = Math.min(1, Math.max(0, (t[i] - lo) / span));
  t = new Float32Array(0);

  // Height for direction.
  let h = L;
  if (o.depth) {
    const D = sampleImage(o.depth, a, sg, { ...o.adjust, blur: 0 }, 0, false);
    h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = D[i] * (1 - o.relief) + L[i] * o.relief;
  }
  const [gx, gy] = sobel(blur(h, W, H, px(o.preBlur)), W, H);
  if (o.edgeSensitivity > 0) {
    const mag = new Float32Array(n);
    let mx = 1e-9;
    for (let i = 0; i < n; i++) { mag[i] = Math.hypot(gx[i], gy[i]); if (mag[i] > mx) mx = mag[i]; }
    const m = blur(mag, W, H, px(0.6));
    for (let i = 0; i < n; i++) tone[i] = Math.max(0, tone[i] - o.edgeSensitivity * Math.min(1, (m[i] / mx) * 4));
  }
  const xx = new Float32Array(n), yy = new Float32Array(n), xy = new Float32Array(n);
  for (let i = 0; i < n; i++) { xx[i] = gx[i] * gx[i]; yy[i] = gy[i] * gy[i]; xy[i] = gx[i] * gy[i]; }
  const c = new Float32Array(n), s = new Float32Array(n);
  for (const [sigma, w] of [[px(o.detail), 1], [px(o.swirlSize), o.swirlStrength]] as const) {
    if (w === 0) continue;
    const XX = blur(xx, W, H, sigma), YY = blur(yy, W, H, sigma), XY = blur(xy, W, H, sigma);
    for (let i = 0; i < n; i++) { c[i] -= w * (XX[i] - YY[i]); s[i] -= w * 2 * XY[i]; } // rotate 90°: along strokes
  }
  // Direction offset and wobble are rotations in double-angle space.
  const off = (o.offset * Math.PI) / 90, co = Math.cos(off), so = Math.sin(off);
  const noise = o.wobble > 0 ? valueNoise(W, H, px(o.wobbleSize), seed) : null, na = (o.wobble * Math.PI) / 90;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    let cc = c[i] * co - s[i] * so, ss = c[i] * so + s[i] * co;
    if (noise) { const r = noise[i] * na, ca = Math.cos(r), sa = Math.sin(r), t2 = cc * ca - ss * sa; ss = cc * sa + ss * ca; cc = t2; }
    c[i] = cc; s[i] = ss;
    mean += Math.hypot(cc, ss);
  }
  if (o.flatFallback) { const eps = (mean / n) * 0.02; for (let i = 0; i < n; i++) c[i] -= eps; }
  return { grid, direction: { width: W, height: H, c, s }, tone: { width: W, height: H, data: tone }, luma: { width: W, height: H, data: luma } };
}

export interface TraceOptions {
  darkestSpacing: number; lightestSpacing: number; gamma: number; clearance: number; whiteCut: number;
  minLength: number; maxLength: number; maxTurn: number; stepSize: number; seedOrder: SeedOrder; maxLines: number; seedClearance?: number; selfCollision?: "line" | "half";
}

export function traceImageFlow(sheet: Sheet, f: ReturnType<typeof imageFlowFields>, t: TraceOptions, seed: number,
  onProgress?: (p: number, partial: PlotPath[]) => void, signal?: AbortSignal): GeometryCollection {
  const { grid, direction, tone } = f, a = sheet.area;
  const { lines } = traceStreamlines({
    direction, tone, mmPerPx: grid.mmPerPx,
    params: { ...t, seed },
    maxLines: t.maxLines,
    shouldStop: signal && (() => signal.aborted),
    onBatch: onProgress && ((b, p) => onProgress(p, fromFlat(gridToMm(b, grid.mmPerPx, a.x, a.y), DEFAULT_LAYER.id, "b"))),
  });
  return { widthMm: sheet.width, heightMm: sheet.height, layers: [DEFAULT_LAYER], paths: fromFlat(gridToMm(lines, grid.mmPerPx, a.x, a.y), DEFAULT_LAYER.id) };
}
