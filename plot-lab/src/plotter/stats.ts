import { polylineLength } from "../geometry/convert";
import type { GeometryCollection, Point } from "../geometry/types";
import type { PlotterProfile } from "./profiles";

export interface PlotStats {
  paths: number;
  points: number;
  penLifts: number;
  /** mm */
  penDown: number;
  /** mm, starting from the sheet origin */
  penUp: number;
  /**
   * Pen-down slowdowns at corners, in full stops: each vertex adds (1 − f)², where f = (1 + cos turn) / 2 is the
   * fraction of full speed the plotter keeps through it (straight = 0, right angle = 0.25, reversal = 1).
   */
  corners: number;
  /** s */
  time: number;
}

export type TimingProfile = Pick<PlotterProfile, "penDownSpeed" | "penUpSpeed" | "penLiftDelay"> & Partial<Pick<PlotterProfile, "acceleration" | "timeFactor">>;

/** Sum of (1 − f)² over the interior vertices of a path (and the closing vertex of a closed one). */
function cornerStops(pts: Point[], closed: boolean): number {
  const n = pts.length;
  let sum = 0;
  const at = (i: number) => pts[(i + n) % n];
  const first = closed ? 0 : 1, last = closed ? n : n - 1;
  for (let i = first; i < last; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1);
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (l <= 1e-12) continue;
    const f = (1 + (ux * vx + uy * vy) / l) / 2;
    sum += (1 - f) ** 2;
  }
  return sum;
}

export function plotStats(g: GeometryCollection, profile: TimingProfile): PlotStats {
  let points = 0, penDown = 0, penUp = 0, corners = 0, cx = 0, cy = 0, paths = 0;
  for (const p of g.paths) {
    if (p.points.length === 0) continue;
    paths++;
    points += p.points.length;
    penDown += polylineLength(p.points, p.closed);
    corners += cornerStops(p.points, p.closed);
    const first = p.points[0], last = p.closed ? first : p.points[p.points.length - 1];
    penUp += Math.hypot(first.x - cx, first.y - cy);
    cx = last.x; cy = last.y;
  }
  const s = { paths, points, penLifts: paths, penDown, penUp, corners };
  return { ...s, time: retime(s, profile) };
}

/**
 * Plot time from the stats, so a profile change re-times a drawing without regenerating it.
 * Travel at full speed, plus the time lost to acceleration: a full stop costs v / a over cruising through, a
 * slowdown to f·v costs v(1 − f)² / a. Every path starts and ends at rest; every pen-up move is one stop.
 * Very short moves never reach full speed, so they are slightly overestimated — the calibration factor absorbs that.
 */
export function retime(s: Pick<PlotStats, "penDown" | "penUp" | "penLifts"> & Partial<Pick<PlotStats, "corners">>, p: TimingProfile): number {
  const vd = Math.max(1e-6, p.penDownSpeed), vu = Math.max(1e-6, p.penUpSpeed), a = p.acceleration ?? 0;
  let t = s.penDown / vd + s.penUp / vu + s.penLifts * p.penLiftDelay;
  if (a > 0) t += ((s.penLifts + (s.corners ?? 0)) * vd + s.penLifts * vu) / a;
  return t * (p.timeFactor && p.timeFactor > 0 ? p.timeFactor : 1);
}

/** Lengths of the pen-up moves between consecutive paths (not the first move from the origin). */
export function travelMoves(g: GeometryCollection): number[] {
  const out: number[] = [];
  let prev: Point | null = null;
  for (const p of g.paths) {
    if (p.points.length === 0) continue;
    const first = p.points[0];
    if (prev) out.push(Math.hypot(first.x - prev.x, first.y - prev.y));
    prev = p.closed ? first : p.points[p.points.length - 1];
  }
  return out;
}
