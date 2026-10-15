import type { GeometryCollection } from "../geometry/types";

export interface InkDensity {
  /** Share of inked 1 mm cells whose ink coverage reaches 100 % (they will plot as solid black). */
  saturated: number;
  /** Highest coverage of any cell (1 = fully covered). */
  max: number;
}

/** Ink coverage on a 1 mm grid: (length of line in the cell × pen width) / cell area. */
export function inkDensity(g: GeometryCollection, penWidth: number, cell = 1): InkDensity {
  const W = Math.ceil(g.widthMm / cell) + 1, H = Math.ceil(g.heightMm / cell) + 1, acc = new Float32Array(W * H);
  const add = (x: number, y: number, len: number) => {
    const i = Math.floor(y / cell) * W + Math.floor(x / cell);
    if (i >= 0 && i < acc.length) acc[i] += len;
  };
  for (const p of g.paths) {
    const pts = p.points, n = pts.length + (p.closed ? 1 : 0);
    for (let k = 1; k < n; k++) {
      const a = pts[k - 1], b = pts[k % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / (cell * 0.25)));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        add(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, len / steps);
      }
    }
  }
  let inked = 0, full = 0, max = 0;
  const k = penWidth / (cell * cell);
  for (const v of acc) {
    if (v <= 0) continue;
    const c = v * k;
    inked++;
    if (c >= 1) full++;
    if (c > max) max = c;
  }
  return { saturated: inked ? full / inked : 0, max };
}
