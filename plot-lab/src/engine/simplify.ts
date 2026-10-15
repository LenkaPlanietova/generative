import type { Path } from "../core/path";

/** Ramer–Douglas–Peucker simplification (iterative). `tol` in the path's own units. */
export function rdp(pts: Path, tol: number): Path {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st: [number, number][] = [[0, n - 1]], t2 = tol * tol;
  while (st.length) {
    const [a, b] = st.pop()!;
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-12;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax, py = pts[i * 2 + 1] - ay;
      let t = (px * dx + py * dy) / L;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ey = py - t * dy, d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  let m = 0;
  for (let i = 0; i < n; i++) if (keep[i]) m++;
  const out = new Float32Array(m * 2);
  let o = 0;
  for (let i = 0; i < n; i++) if (keep[i]) { out[o++] = pts[i * 2]; out[o++] = pts[i * 2 + 1]; }
  return out;
}
