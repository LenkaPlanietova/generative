import { polylineLength } from "../geometry/convert";
import type { GeometryCollection } from "../geometry/types";
import type { PlotterProfile } from "./profiles";

export interface PlotStats {
  paths: number;
  points: number;
  penLifts: number;
  /** mm */
  penDown: number;
  /** mm, starting from the sheet origin */
  penUp: number;
  /** s */
  time: number;
}

export function plotStats(g: GeometryCollection, profile: Pick<PlotterProfile, "penDownSpeed" | "penUpSpeed" | "penLiftDelay">): PlotStats {
  let points = 0, penDown = 0, penUp = 0, cx = 0, cy = 0, paths = 0;
  for (const p of g.paths) {
    if (p.points.length === 0) continue;
    paths++;
    points += p.points.length;
    penDown += polylineLength(p.points, p.closed);
    const first = p.points[0], last = p.closed ? first : p.points[p.points.length - 1];
    penUp += Math.hypot(first.x - cx, first.y - cy);
    cx = last.x; cy = last.y;
  }
  return { paths, points, penLifts: paths, penDown, penUp, time: retime({ penDown, penUp, penLifts: paths }, profile) };
}

export function retime(s: Pick<PlotStats, "penDown" | "penUp" | "penLifts">, p: Pick<PlotterProfile, "penDownSpeed" | "penUpSpeed" | "penLiftDelay">): number {
  return s.penDown / Math.max(1e-6, p.penDownSpeed) + s.penUp / Math.max(1e-6, p.penUpSpeed) + s.penLifts * p.penLiftDelay;
}
