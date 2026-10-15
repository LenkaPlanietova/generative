import type { Point } from "./types";

export interface Rect { x: number; y: number; width: number; height: number }

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Liang–Barsky: the part of segment a→b inside r as [t0, t1], or null. */
function clipSegment(a: Point, b: Point, r: Rect): [number, number] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy], q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [t0, t1];
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Cut a polyline at the rectangle's edges and keep the inside pieces (real geometry clipping, not a mask).
 * A closed polyline lying fully inside stays one closed piece.
 */
export function clipPolyline(points: Point[], r: Rect, closed = false): { points: Point[]; closed: boolean }[] {
  if (points.length < 2) return [];
  if (points.every((p) => inside(p, r))) return [{ points, closed }];
  const pts = closed ? [...points, points[0]] : points, out: { points: Point[]; closed: boolean }[] = [];
  let cur: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = clipSegment(a, b, r);
    if (!c) { if (cur.length > 1) out.push({ points: cur, closed: false }); cur = []; continue; }
    const [t0, t1] = c, pa = t0 > 0 ? lerp(a, b, t0) : a, pb = t1 < 1 ? lerp(a, b, t1) : b;
    if (!cur.length || t0 > 0) {
      if (cur.length > 1) out.push({ points: cur, closed: false });
      cur = [pa];
    }
    cur.push(pb);
    if (t1 < 1) { if (cur.length > 1) out.push({ points: cur, closed: false }); cur = []; }
  }
  if (cur.length > 1) out.push({ points: cur, closed: false });
  // A closed shape cut open: if the first and last piece meet at the start point, join them.
  if (closed && out.length > 1) {
    const first = out[0].points, last = out[out.length - 1].points, s = first[0], e = last[last.length - 1];
    if (s === points[0] && Math.hypot(s.x - e.x, s.y - e.y) < 1e-9) {
      out[0] = { points: [...last, ...first.slice(1)], closed: false };
      out.pop();
    }
  }
  return out;
}
