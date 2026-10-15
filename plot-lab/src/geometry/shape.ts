import type { Rect } from "./clip";
import type { Point } from "./types";

/** Rotate points about (cx, cy), angle in degrees. */
export function rotate(points: Point[], deg: number, cx = 0, cy = 0): Point[] {
  if (!deg) return points;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return points.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

/**
 * Scale and centre unit-free curves so their joint bounding box fills `size` (0..1) of the rectangle,
 * keeping proportions. Used by parametric algorithms (spirograph, Lissajous, harmonograph).
 */
export function fitToRect(curves: Point[][], r: Rect, size = 1): Point[][] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of curves) for (const p of c) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return curves;
  const w = Math.max(1e-9, maxX - minX), h = Math.max(1e-9, maxY - minY);
  const k = Math.min((r.width * size) / w, (r.height * size) / h);
  const ox = r.x + r.width / 2 - ((minX + maxX) / 2) * k, oy = r.y + r.height / 2 - ((minY + maxY) / 2) * k;
  return curves.map((c) => c.map((p) => ({ x: ox + p.x * k, y: oy + p.y * k })));
}

/** Chaikin corner cutting — smooths polylines; endpoints of open curves stay fixed. */
export function chaikin(points: Point[], closed: boolean, iterations: number): Point[] {
  let pts = points;
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const n = pts.length, out: Point[] = closed ? [] : [pts[0]];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

export const gcd = (a: number, b: number): number => {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
