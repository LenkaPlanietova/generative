import { type Sheet, type PaperSettings, sheetFor } from "../core/paper";
import { marchingSquares } from "../fields/contours";
import { perlin2 } from "../fields/noise";
import type { Rect } from "../geometry/clip";
import { chaikin } from "../geometry/shape";
import { clipPolyline } from "../geometry/clip";
import { DEFAULT_LAYER, type GeometryCollection, type Point } from "../geometry/types";
import type { NumberParam, ParamValues } from "./types";

export interface Curve { points: Point[]; closed: boolean }

/** Numbers and strings out of resolved parameter values. */
export const num = (v: ParamValues, id: string) => v[id] as number;
export const str = (v: ParamValues, id: string) => v[id] as string;

export const sheetOf = (paper: PaperSettings): Sheet => sheetFor(paper);

/** Clip every curve to the drawing area (real cuts) and package it as a single-layer collection. */
export function toCollection(sheet: Sheet, curves: Curve[], clip = true): GeometryCollection {
  const pieces = clip ? curves.flatMap((c) => clipPolyline(c.points, sheet.area, c.closed)) : curves;
  return {
    widthMm: sheet.width,
    heightMm: sheet.height,
    layers: [DEFAULT_LAYER],
    paths: pieces.filter((c) => c.points.length >= 2).map((c, i) => ({ id: `p${i}`, points: c.points, closed: c.closed, layerId: DEFAULT_LAYER.id })),
  };
}

/** Shared "wobble": a seeded, smooth displacement that makes exact maths look drawn. */
export const WOBBLE_PARAMS: NumberParam[] = [
  { id: "wobble", type: "number", group: "Noise", label: "Wobble amount", default: 0, min: 0, max: 5, step: 0.05, unit: "mm",
    description: "Seeded, smooth displacement of the line. Uses the seed; 0 = exact curve." },
  { id: "wobbleSize", type: "number", group: "Noise", label: "Wobble size", default: 12, min: 1, max: 100, step: 1, unit: "mm",
    description: "Feature size of the wobble.", visibleWhen: (v) => (v.wobble as number) > 0 },
];

export function applyWobble(curves: Curve[], amount: number, size: number, seed: number): Curve[] {
  if (amount <= 0) return curves;
  const nx = perlin2(seed * 13 + 1), ny = perlin2(seed * 13 + 2);
  return curves.map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x + nx(p.x / size, p.y / size) * amount, y: p.y + ny(p.x / size, p.y / size) * amount })) }));
}

/** Sample t ∈ [t0, t1] in `n` steps. */
export function sample(n: number, t0: number, t1: number, f: (t: number) => Point): Point[] {
  const pts: Point[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) pts[i] = f(t0 + ((t1 - t0) * i) / n);
  return pts;
}

/**
 * Contour lines of a grid field at each level, mapped onto the rectangle (grid corners on its corners) and
 * smoothed with `smoothing` Chaikin passes. Returns one list of curves per level.
 */
export function traceLevels(data: Float32Array, W: number, H: number, levels: number[], r: Rect, smoothing: number): Curve[][] {
  const sx = r.width / (W - 1), sy = r.height / (H - 1);
  return levels.map((level) => marchingSquares(data, W, H, level).map((c) => ({
    points: chaikin(c.points.map((p) => ({ x: r.x + p.x * sx, y: r.y + p.y * sy })), c.closed, smoothing),
    closed: c.closed,
  })));
}

/** A grid covering the rectangle with `resolution` cells along its long side; returns size and cell sizes. */
export function gridOver(r: Rect, resolution: number): { W: number; H: number; sx: number; sy: number } {
  const cell = Math.max(r.width, r.height) / resolution;
  const W = Math.max(4, Math.round(r.width / cell) + 1), H = Math.max(4, Math.round(r.height / cell) + 1);
  return { W, H, sx: r.width / (W - 1), sy: r.height / (H - 1) };
}

/** Several named layers (one SVG layer / pen each), every curve clipped to the drawing area. */
export function toLayeredCollection(sheet: Sheet, layers: { id: string; name: string; curves: Curve[] }[]): GeometryCollection {
  const paths: GeometryCollection["paths"] = [];
  for (const l of layers)
    for (const c of l.curves.flatMap((c) => clipPolyline(c.points, sheet.area, c.closed)))
      if (c.points.length >= 2) paths.push({ id: `${l.id}-${paths.length}`, points: c.points, closed: c.closed, layerId: l.id });
  return { widthMm: sheet.width, heightMm: sheet.height, layers: layers.map((l) => ({ id: l.id, name: l.name, stroke: "#000000" })), paths };
}
