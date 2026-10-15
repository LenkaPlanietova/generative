import type { Path } from "../core/path";

/** Greedy nearest-neighbour ordering with path reversal, to cut pen-up travel (flat-array form, as in the reference). */
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
