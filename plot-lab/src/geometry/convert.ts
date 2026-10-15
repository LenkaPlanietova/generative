import type { Path } from "../core/path";
import type { Point, PlotPath } from "./types";

/** Interleaved [x0, y0, x1, y1, …] polylines (engine output) → PlotPaths. */
export function fromFlat(paths: Path[], layerId: string, prefix = "p"): PlotPath[] {
  return paths.map((p, i) => {
    const points: Point[] = new Array(p.length / 2);
    for (let j = 0; j < p.length; j += 2) points[j / 2] = { x: p[j], y: p[j + 1] };
    return { id: `${prefix}${i}`, points, closed: false, layerId };
  });
}

export function polylineLength(points: Point[], closed = false): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 2) {
    const a = points[points.length - 1], b = points[0];
    l += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return l;
}

export function bounds(paths: PlotPath[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const q of p.points) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
