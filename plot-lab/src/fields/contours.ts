/**
 * Marching squares with linear interpolation. Segments are joined into continuous polylines by the grid edge
 * they cross, so each contour comes out as one path (closed when it closes), not fragments.
 * Coordinates are grid cells; the caller maps them to millimetres.
 */
import type { Point } from "../geometry/types";

export interface Contour { points: Point[]; closed: boolean }

export function marchingSquares(data: Float32Array, W: number, H: number, level: number): Contour[] {
  // Edge ids: horizontal edge (x,y)-(x+1,y) = y*W + x; vertical edge (x,y)-(x,y+1) = W*H + y*W + x.
  const hEdge = (x: number, y: number) => y * W + x, vEdge = (x: number, y: number) => W * H + y * W + x;
  const pos = new Map<number, Point>();
  const at = (e: number): Point => {
    let p = pos.get(e);
    if (p) return p;
    if (e < W * H) {
      const x = e % W, y = (e / W) | 0, a = data[e], b = data[e + 1], t = (level - a) / (b - a);
      p = { x: x + t, y };
    } else {
      const k = e - W * H, x = k % W, y = (k / W) | 0, a = data[k], b = data[k + W], t = (level - a) / (b - a);
      p = { x, y: y + t };
    }
    pos.set(e, p);
    return p;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const v0 = data[y * W + x], v1 = data[y * W + x + 1], v2 = data[(y + 1) * W + x + 1], v3 = data[(y + 1) * W + x];
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const top = hEdge(x, y), right = vEdge(x + 1, y), bottom = hEdge(x, y + 1), left = vEdge(x, y);
      switch (c) {
        case 1: case 14: link(left, top); break;
        case 2: case 13: link(top, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(right, bottom); break;
        case 6: case 9: link(top, bottom); break;
        case 7: case 8: link(left, bottom); break;
        case 5: case 10: {
          // Saddle: resolve with the cell-centre average.
          const centre = (v0 + v1 + v2 + v3) / 4 > level;
          // Case 5 (v0, v2 high) with a high centre joins the high corners, cutting off v1 and v3; and vice versa.
          if ((c === 5) === centre) { link(top, right); link(left, bottom); }
          else { link(left, top); link(right, bottom); }
          break;
        }
      }
    }
  }
  // Walk chains: start from ends (degree 1) first, then remaining loops.
  const used = new Set<number>(), out: Contour[] = [];
  const walk = (start: number) => {
    const chain = [start];
    used.add(start);
    let prev = -1, cur = start;
    while (true) {
      const next = links.get(cur)!.find((n) => n !== prev && !used.has(n));
      if (next === undefined) break;
      chain.push(next);
      used.add(next);
      prev = cur;
      cur = next;
    }
    const closed = chain.length > 2 && links.get(cur)!.includes(start) && links.get(start)!.length === 2;
    out.push({ points: chain.map(at), closed });
  };
  for (const [e, n] of links) if (n.length === 1 && !used.has(e)) walk(e);
  for (const e of links.keys()) if (!used.has(e)) walk(e);
  return out;
}
