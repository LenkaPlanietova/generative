import { type Sheet, type PaperSettings, sheetFor } from "../core/paper";
import { perlin2 } from "../fields/noise";
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
