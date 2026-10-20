/**
 * Hidden-line removal for plotter drawings of 3D surfaces. The surface is drawn into a depth buffer (in sheet mm);
 * a line drawn on that surface is kept only where it is not behind the buffer, and cut into separate strokes
 * where it disappears. Depth grows towards the viewer.
 */
import type { Point } from "../geometry/types";

export interface P3 { x: number; y: number; z: number }

export class DepthBuffer {
  readonly W: number;
  readonly H: number;
  readonly data: Float32Array;

  /** Covers [x0, x0 + width] × [y0, y0 + height] mm with square cells of `cell` mm. */
  constructor(readonly x0: number, readonly y0: number, width: number, height: number, readonly cell: number) {
    this.W = Math.max(1, Math.ceil(width / cell) + 1);
    this.H = Math.max(1, Math.ceil(height / cell) + 1);
    this.data = new Float32Array(this.W * this.H).fill(-Infinity);
  }

  /** Rasterises a projected triangle (x, y in mm, z = depth), keeping the nearest depth per cell. */
  triangle(a: P3, b: P3, c: P3): void {
    const { cell, x0, y0, W, H, data } = this;
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-12) return;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell)), i1 = Math.min(W - 1, Math.ceil((Math.max(a.x, b.x, c.x) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - y0) / cell)), j1 = Math.min(H - 1, Math.ceil((Math.max(a.y, b.y, c.y) - y0) / cell));
    const inv = 1 / area, tol = -1e-6;
    for (let j = j0; j <= j1; j++) {
      const py = y0 + j * cell;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * cell;
        const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) * inv;
        const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < tol || w1 < tol || w2 < tol) continue;
        const z = w0 * a.z + w1 * b.z + w2 * c.z, k = j * W + i;
        if (z > data[k]) data[k] = z;
      }
    }
  }

  /** Depth of the cell nearest (x, y), −∞ where nothing was drawn. */
  depthAt(x: number, y: number): number {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((y - this.y0) / this.cell);
    return i >= 0 && j >= 0 && i < this.W && j < this.H ? this.data[j * this.W + i] : -Infinity;
  }
}

/**
 * The visible parts of a projected 3D polyline lying on the buffered surface. Segments are subdivided so every
 * test is at most one cell apart; a point is visible unless the surface in front of it is more than `eps` nearer.
 * Where a line runs almost edge-on to the viewer the test flickers, so hidden gaps shorter than `maxGap` mm are
 * bridged and visible pieces shorter than `minRun` mm are dropped.
 */
export function visibleRuns(pts: P3[], closed: boolean, buf: DepthBuffer, eps: number, minRun: number, maxGap = 0): Point[][] {
  // Sample the curve and test each sample.
  const xs: number[] = [], ys: number[] = [], vis: boolean[] = [];
  const test = (x: number, y: number, z: number) => { xs.push(x); ys.push(y); vis.push(z >= buf.depthAt(x, y) - eps); };
  const n = pts.length, segs = closed ? n : n - 1;
  if (!n) return [];
  test(pts[0].x, pts[0].y, pts[0].z);
  for (let s = 0; s < segs; s++) {
    const a = pts[s], b = pts[(s + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / buf.cell));
    for (let t = 1; t <= k; t++) test(a.x + ((b.x - a.x) * t) / k, a.y + ((b.y - a.y) * t) / k, a.z + ((b.z - a.z) * t) / k);
  }
  if (closed) { xs.pop(); ys.pop(); vis.pop(); } // the last sample repeats the first
  const m = vis.length, at = (i: number) => (closed ? ((i % m) + m) % m : i);
  const dist = (i: number, j: number) => Math.hypot(xs[at(j)] - xs[at(i)], ys[at(j)] - ys[at(i)]);

  // Maximal stretches of equal visibility: sample indices s..e (inclusive; wrapping round when closed) and length.
  const stretches = () => {
    const out: { v: boolean; s: number; e: number; len: number }[] = [];
    let first = 0;
    if (closed) {
      while (first < m && vis[first] === vis[at(first - 1)]) first++;
      if (first === m) return [{ v: vis[0], s: 0, e: m - 1, len: Infinity }]; // all one state
    }
    const steps = closed ? m : m - 1;
    let s = first, len = 0;
    for (let k = 1; k <= steps; k++) {
      const i = at(first + k - 1), j = at(first + k);
      if (k < m && vis[j] === vis[i]) { len += dist(i, j); continue; }
      out.push({ v: vis[i], s, e: i, len });
      s = j; len = 0;
    }
    if (!closed) out.push({ v: vis[m - 1], s, e: m - 1, len });
    return out;
  };
  const fill = (v: boolean, maxLen: number) => {
    for (const st of stretches())
      // Gaps are only bridged between two visible pieces; flecks are dropped wherever they are.
      if (st.v === v && st.len < maxLen && (v || closed || (st.s > 0 && st.e < m - 1)))
        for (let i = st.s; ; i = at(i + 1)) { vis[i] = !v; if (i === st.e) break; }
  };
  if (maxGap > 0) fill(false, maxGap);
  if (minRun > 0) fill(true, minRun);

  const runs: Point[][] = [];
  for (const st of stretches()) {
    if (!st.v) continue;
    const run: Point[] = [];
    for (let i = st.s; ; i = at(i + 1)) { run.push({ x: xs[i], y: ys[i] }); if (i === st.e) break; }
    if (closed && st.len === Infinity) run.push({ x: xs[0], y: ys[0] }); // fully visible loop
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

/** Rotation (degrees) about Z (spin), then X (tilt), then Y (turn), and a projection to the sheet. */
export function camera(o: { spin: number; tilt: number; turn: number; cx: number; cy: number; perspective: number; extent: number }) {
  const r = Math.PI / 180, [cz, sz] = [Math.cos(o.spin * r), Math.sin(o.spin * r)], [cxr, sxr] = [Math.cos(o.tilt * r), Math.sin(o.tilt * r)];
  const [cyr, syr] = [Math.cos(o.turn * r), Math.sin(o.turn * r)];
  // Camera distance: very far = orthographic; perspective 1 = close (1.2 × the object's extent).
  const D = o.perspective > 0 ? o.extent * (1.2 + 12 * (1 - o.perspective) ** 2) : Infinity;
  return (x: number, y: number, z: number): P3 => {
    let X = x * cz - y * sz, Y = x * sz + y * cz, Z = z;
    // Tilt tips the top towards the viewer: height turns into "up the sheet", the far side recedes.
    const Y2 = Y * cxr + Z * sxr; Z = -Y * sxr + Z * cxr; Y = Y2;
    const X2 = X * cyr + Z * syr; Z = -X * syr + Z * cyr; X = X2;
    const s = Number.isFinite(D) ? D / (D - Z) : 1;
    return { x: o.cx + X * s, y: o.cy - Y * s, z: Z };
  };
}
