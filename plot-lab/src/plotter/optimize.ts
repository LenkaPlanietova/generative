/**
 * Pen-plotter optimisation. Only removes degenerate geometry, simplifies within the given tolerance, and
 * reorders/reverses whole paths — it never moves points further than `simplify` mm, and only merges paths when
 * `joinGap` is set (then consecutive paths of one layer whose gap is at most `joinGap` are drawn without a lift).
 */
import { polylineLength } from "../geometry/convert";
import type { GeometryCollection, PlotPath, Point } from "../geometry/types";

export interface OptimizeOptions {
  /** Drop consecutive points closer than this, mm. */
  dedupe: number;
  /** Drop paths shorter than this, mm (zero-length paths are always dropped). */
  minPathLength: number;
  /** Ramer–Douglas–Peucker tolerance, mm; 0 = off. */
  simplify: number;
  /** Nearest-neighbour ordering (with reversal of open paths). */
  order: boolean;
  /** Draw across pen-up gaps up to this long instead of lifting, mm; 0 = off. Applied after ordering. */
  joinGap: number;
}

export const DEFAULT_OPTIMIZE: OptimizeOptions = { dedupe: 0.001, minPathLength: 0.5, simplify: 0.05, order: true, joinGap: 0 };

export function dedupePoints(points: Point[], eps: number): Point[] {
  if (points.length < 2) return points.slice();
  const out = [points[0]], e2 = eps * eps;
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1], b = points[i];
    if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 > e2) out.push(b);
  }
  return out;
}

export function rdpPoints(points: Point[], tol: number): Point[] {
  const n = points.length;
  if (n < 3 || tol <= 0) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = points[a], B = points[b], dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy || 1e-12;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - A.x, py = points[i].y - A.y;
      const t = Math.min(1, Math.max(0, (px * dx + py * dy) / L));
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Greedy nearest neighbour from (sx, sy); open paths may be reversed, closed paths are entered at their start. */
export function orderNearest(paths: PlotPath[], sx = 0, sy = 0): PlotPath[] {
  const n = paths.length, used = new Uint8Array(n), out: PlotPath[] = [];
  let cx = sx, cy = sy;
  for (let k = 0; k < n; k++) {
    let best = -1, bd = Infinity, rev = false;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const pts = paths[i].points, s = pts[0];
      let d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
      if (d < bd) { bd = d; best = i; rev = false; }
      if (!paths[i].closed) {
        const e = pts[pts.length - 1];
        d = (e.x - cx) ** 2 + (e.y - cy) ** 2;
        if (d < bd) { bd = d; best = i; rev = true; }
      }
    }
    used[best] = 1;
    const p = rev ? { ...paths[best], points: paths[best].points.slice().reverse() } : paths[best];
    out.push(p);
    const end = p.closed ? p.points[0] : p.points[p.points.length - 1];
    cx = end.x; cy = end.y;
  }
  return out;
}

export function optimize(g: GeometryCollection, o: OptimizeOptions): GeometryCollection {
  const cleaned: PlotPath[] = [];
  for (const p of g.paths) {
    let pts = dedupePoints(p.points, Math.max(1e-9, o.dedupe));
    if (pts.length < 2) continue;
    const len = polylineLength(pts, p.closed);
    if (len <= 1e-9 || len < o.minPathLength) continue;
    if (o.simplify > 0) pts = rdpPoints(pts, o.simplify);
    cleaned.push({ ...p, points: pts });
  }
  let paths = cleaned;
  if (o.order) {
    // Order within each layer, layers plotted in their listed order.
    paths = [];
    let cx = 0, cy = 0;
    for (const layer of g.layers) {
      const ordered = orderNearest(cleaned.filter((p) => p.layerId === layer.id), cx, cy);
      if (ordered.length) {
        const last = ordered[ordered.length - 1], e = last.closed ? last.points[0] : last.points[last.points.length - 1];
        cx = e.x; cy = e.y;
      }
      paths.push(...ordered);
    }
  }
  if (o.joinGap > 0) paths = joinGaps(paths, o.joinGap);
  return { ...g, paths };
}

/** Merges each path into the previous one when both are on the same layer and the gap between them is ≤ `gap` mm. */
export function joinGaps(paths: PlotPath[], gap: number): PlotPath[] {
  const out: PlotPath[] = [], g2 = gap * gap;
  // Closed paths end where they start; as part of a longer stroke they keep their closing segment.
  const open = (p: PlotPath) => (p.closed ? [...p.points, p.points[0]] : p.points.slice());
  let joined = false; // whether out's last path owns a fresh points array we may append to
  for (const p of paths) {
    const prev = out[out.length - 1];
    if (prev && prev.layerId === p.layerId) {
      const e = prev.closed ? prev.points[0] : prev.points[prev.points.length - 1], s = p.points[0];
      if ((s.x - e.x) ** 2 + (s.y - e.y) ** 2 <= g2) {
        if (!joined) out[out.length - 1] = { ...prev, closed: false, points: open(prev) };
        const pts = out[out.length - 1].points;
        for (const q of p.closed ? [...p.points, p.points[0]] : p.points) pts.push(q);
        joined = true;
        continue;
      }
    }
    out.push(p);
    joined = false;
  }
  return out;
}
