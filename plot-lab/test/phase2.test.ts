import { describe, expect, it } from "vitest";
import { harmonograph } from "../src/algorithms/harmonograph";
import { lissajous } from "../src/algorithms/lissajous";
import { radialGeometry } from "../src/algorithms/radialGeometry";
import { spirograph } from "../src/algorithms/spirograph";
import { waveDistortion } from "../src/algorithms/waveDistortion";
import { defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER, sheetFor } from "../src/core/paper";
import { marchingSquares } from "../src/fields/contours";
import { clipPolyline } from "../src/geometry/clip";
import { chaikin, fitToRect } from "../src/geometry/shape";

const square = { ...DEFAULT_PAPER, paper: "Square" as const }; // 200 × 200, 20 mm margin → area 160 × 160 at (20, 20)
const centre = { x: 100, y: 100 };
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - centre.x, p.y - centre.y);

describe("clipping", () => {
  const r = { x: 0, y: 0, width: 10, height: 10 };
  it("cuts a crossing line exactly at the boundary", () => {
    const [piece] = clipPolyline([{ x: -5, y: 5 }, { x: 5, y: 5 }, { x: 15, y: 5 }], r);
    expect(piece.points).toEqual([{ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 }]);
  });
  it("splits a line that leaves and re-enters", () => {
    const pieces = clipPolyline([{ x: 2, y: 2 }, { x: 2, y: 20 }, { x: 8, y: 20 }, { x: 8, y: 2 }], r);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.points.every((q) => q.y <= 10 && q.y >= 0))).toBe(true);
  });
  it("keeps closed shapes that are fully inside closed, and drops shapes fully outside", () => {
    const sq = [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }];
    expect(clipPolyline(sq, r, true)).toEqual([{ points: sq, closed: true }]);
    expect(clipPolyline(sq.map((p) => ({ x: p.x + 50, y: p.y })), r, true)).toEqual([]);
  });
  it("joins the two halves of a closed shape cut on one side into one open path", () => {
    const pieces = clipPolyline([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 8 }, { x: 5, y: 8 }], r, true);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].closed).toBe(false);
  });
});

describe("marching squares", () => {
  it("traces a circle as one closed contour at the right radius", () => {
    const W = 101, H = 101, data = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = Math.hypot(x - 50, y - 50);
    const cs = marchingSquares(data, W, H, 30);
    expect(cs).toHaveLength(1);
    expect(cs[0].closed).toBe(true);
    for (const p of cs[0].points) expect(Math.abs(Math.hypot(p.x - 50, p.y - 50) - 30)).toBeLessThan(0.05);
  });
  it("gives open contours where they meet the grid edge, never fragments", () => {
    const W = 50, H = 30, data = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = x + 0.3 * Math.sin(y / 3);
    const cs = marchingSquares(data, W, H, 20.5);
    expect(cs).toHaveLength(1);
    expect(cs[0].closed).toBe(false);
    expect(cs[0].points.length).toBe(H);
  });
  it("separates saddle cells consistently with the centre value", () => {
    // 2×2 saddle: high corners top-left and bottom-right, high centre → the high corners join.
    const cs = marchingSquares(Float32Array.from([1, 0, 0, 1]), 2, 2, 0.4);
    expect(cs).toHaveLength(2);
    const ends = cs.map((c) => c.points.map((p) => `${p.x},${p.y}`).sort().join(" ")).sort();
    expect(ends).toEqual(["0,0.6 0.4,1", "0.6,0 1,0.4"]);
  });
});

describe("shape helpers", () => {
  it("fitToRect centres and preserves proportions", () => {
    const [c] = fitToRect([[{ x: -1, y: -2 }, { x: 1, y: 2 }]], { x: 0, y: 0, width: 100, height: 100 }, 1);
    expect(c).toEqual([{ x: 25, y: 0 }, { x: 75, y: 100 }]);
  });
  it("chaikin keeps open endpoints", () => {
    const s = chaikin([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false, 2);
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[s.length - 1]).toEqual({ x: 10, y: 10 });
  });
});

describe("algorithm maths", () => {
  it("Lissajous with a = b and δ = 90° is a circle", async () => {
    const g = await lissajous.generate({ params: { ...defaultParams(lissajous), copies: 1, freqX: 1, freqY: 1, phase: 90 }, seed: 1, paper: square });
    expect(g.paths).toHaveLength(1);
    expect(g.paths[0].closed).toBe(true);
    for (const p of g.paths[0].points) expect(Math.abs(dist(p) - 160 * 0.94 / 2)).toBeLessThan(0.01);
  });

  it("Spirograph closes exactly after the automatic number of rotations (R = 3r, d = r → deltoid)", async () => {
    const g = await spirograph.generate({ params: { ...defaultParams(spirograph), fixedRadius: 90, rollingRadius: 30, penOffset: 30 }, seed: 1, paper: square });
    const pts = g.paths[0].points;
    expect(g.paths[0].closed).toBe(true);
    // A deltoid has 3 cusps on its outer circle. Its bounding box is lopsided, so measure from the curve's own centre.
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const rad = (p: { x: number; y: number }) => Math.hypot(p.x - c.x, p.y - c.y), maxR = Math.max(...pts.map(rad));
    const cusps = new Set(pts.filter((p) => rad(p) > maxR - 0.05).map((p) => Math.round((((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 360) % 360) / 40) % 9));
    expect(cusps.size).toBe(3);
    expect(Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y)).toBeLessThan(2); // last sample sits next to the first
  });

  it("Harmonograph swing dies away with damping", async () => {
    const g = await harmonograph.generate({ params: { ...defaultParams(harmonograph), damping: 0.03 }, seed: 1, paper: square });
    const pts = g.paths[0].points, n = pts.length;
    const avg = (from: number, to: number) => pts.slice(from, to).reduce((s, p) => s + dist(p), 0) / (to - from);
    expect(avg(n - n / 10, n)).toBeLessThan(avg(0, n / 10) * 0.2);
  });

  it("Wave Distortion with no distortion draws evenly spaced straight lines across the area", async () => {
    const params = { ...defaultParams(waveDistortion), amplitude: 0, amplitude2: 0, noiseStrength: 0, lineCount: 40 };
    const g = await waveDistortion.generate({ params, seed: 1, paper: square }), a = sheetFor(square).area;
    expect(g.paths).toHaveLength(40);
    const ys = g.paths.map((p) => p.points[0].y).sort((x, y) => x - y);
    for (const p of g.paths) {
      expect(p.points.every((q) => Math.abs(q.y - p.points[0].y) < 1e-9)).toBe(true);
      expect(p.points[0].x).toBeCloseTo(a.x, 6);
      expect(p.points[p.points.length - 1].x).toBeCloseTo(a.x + a.width, 6);
    }
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(a.height / 40, 6);
  });

  it("Radial Geometry without distortion draws concentric circles at even radii", async () => {
    const params = { ...defaultParams(radialGeometry), radialAmp: 0, noise: 0, ringCount: 5, innerRadius: 10, radius: 50 };
    const g = await radialGeometry.generate({ params, seed: 1, paper: square });
    expect(g.paths).toHaveLength(5);
    g.paths.forEach((p, i) => {
      expect(p.closed).toBe(true);
      for (const q of p.points) expect(dist(q)).toBeCloseTo(10 + i * 10, 6);
    });
  });

  it("Radial spiral is one continuous path", async () => {
    const g = await radialGeometry.generate({ params: { ...defaultParams(radialGeometry), mode: "spiral", radius: 60 }, seed: 1, paper: square });
    expect(g.paths).toHaveLength(1);
  });
});
