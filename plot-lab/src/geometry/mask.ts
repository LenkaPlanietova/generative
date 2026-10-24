/**
 * Polygon masks (Plot Layers): a closed, hand-drawn shape in sheet millimetres. Edges are bucketed into 1 mm
 * horizontal strips, so inside tests and edge crossings only look at the few edges near the point.
 */
import type { Point } from "./types";

export interface MaskIndex {
  poly: Point[];
  y0: number;
  strip: number;
  /** Edge indices (edge i runs from poly[i] to poly[i + 1]) per strip. */
  strips: number[][];
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** A usable mask: at least three finite points enclosing more than 1 mm². */
export const isValidMask = (poly: Point[]) =>
  poly.length >= 3 && poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && polygonArea(poly) > 1;

export function indexMask(poly: Point[], strip = 1): MaskIndex {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const strips: number[][] = Array.from({ length: Math.max(1, Math.floor((y1 - y0) / strip) + 1) }, () => []);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const k0 = Math.floor((Math.min(a.y, b.y) - y0) / strip), k1 = Math.floor((Math.max(a.y, b.y) - y0) / strip);
    for (let k = k0; k <= k1; k++) strips[k].push(i);
  }
  return { poly, y0, strip, strips };
}

const edge = (m: MaskIndex, i: number): [Point, Point] => [m.poly[i], m.poly[(i + 1) % m.poly.length]];

/** Crossing-number test with the half-open rule, so a ray through a vertex counts once. */
export function insideMask(m: MaskIndex, p: Point): boolean {
  const k = Math.floor((p.y - m.y0) / m.strip);
  if (k < 0 || k >= m.strips.length) return false;
  let c = false;
  for (const i of m.strips[k]) {
    const [a, b] = edge(m, i);
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c;
  }
  return c;
}

/** Parameters t ∈ [0, 1] along a→b where the segment crosses a mask edge, sorted. */
export function segmentCrossings(m: MaskIndex, a: Point, b: Point): number[] {
  const k0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - m.y0) / m.strip)), k1 = Math.min(m.strips.length - 1, Math.floor((Math.max(a.y, b.y) - m.y0) / m.strip));
  const seen = new Set<number>(), out: number[] = [];
  const rx = b.x - a.x, ry = b.y - a.y;
  for (let k = k0; k <= k1; k++) for (const i of m.strips[k]) {
    if (seen.has(i)) continue;
    seen.add(i);
    const [p, q] = edge(m, i), sx = q.x - p.x, sy = q.y - p.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((p.x - a.x) * sy - (p.y - a.y) * sx) / den, u = ((p.x - a.x) * ry - (p.y - a.y) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t);
  }
  return out.sort((x, y) => x - y);
}
