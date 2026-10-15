import { type Path, pathLength } from "../core/path";

/** Pen-up distance when drawing `lines` in the given order, starting from (sx, sy). */
export function penUpTravel(lines: Path[], sx = 0, sy = 0): number {
  let cx = sx, cy = sy, t = 0;
  for (const L of lines) {
    t += Math.hypot(L[0] - cx, L[1] - cy);
    cx = L[L.length - 2]; cy = L[L.length - 1];
  }
  return t;
}

/** Greedy nearest-neighbour ordering with path reversal, to cut pen-up travel. */
export function orderPaths(lines: Path[], sx = 0, sy = 0): { lines: Path[]; travel: number } {
  const n = lines.length, used = new Uint8Array(n), out: Path[] = [];
  let cx = sx, cy = sy, travel = 0;
  for (let k = 0; k < n; k++) {
    let best = -1, bd = Infinity, rev = false;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const L = lines[i], m = L.length;
      let d = (L[0] - cx) ** 2 + (L[1] - cy) ** 2;
      if (d < bd) { bd = d; best = i; rev = false; }
      d = (L[m - 2] - cx) ** 2 + (L[m - 1] - cy) ** 2;
      if (d < bd) { bd = d; best = i; rev = true; }
    }
    used[best] = 1;
    let L = lines[best];
    if (rev) {
      const r = new Float32Array(L.length);
      for (let j = 0; j < L.length; j += 2) { r[j] = L[L.length - 2 - j]; r[j + 1] = L[L.length - 1 - j]; }
      L = r;
    }
    travel += Math.sqrt(bd);
    out.push(L);
    cx = L[L.length - 2]; cy = L[L.length - 1];
  }
  return { lines: out, travel };
}

export interface PlotSpeeds {
  /** Pen-down drawing speed, mm/s. */
  drawSpeed: number;
  /** Pen-up travel speed, mm/s. */
  travelSpeed: number;
  /** Time per pen lift + drop, s. */
  penLift: number;
}

export const DEFAULT_SPEEDS: PlotSpeeds = { drawSpeed: 30, travelSpeed: 75, penLift: 0.35 };

export interface PlotStats {
  paths: number;
  /** mm */
  ink: number;
  /** mm */
  travel: number;
  /** s */
  time: number;
}

export function plotStats(lines: Path[], speeds: PlotSpeeds = DEFAULT_SPEEDS, travel = penUpTravel(lines)): PlotStats {
  let ink = 0;
  for (const L of lines) ink += pathLength(L);
  return { paths: lines.length, ink, travel, time: ink / speeds.drawSpeed + travel / speeds.travelSpeed + lines.length * speeds.penLift };
}
