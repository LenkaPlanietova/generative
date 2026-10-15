import { describe, expect, it } from "vitest";
import type { Grid } from "../src/core/fields";
import { pathLength } from "../src/core/path";
import { sheetFor } from "../src/core/paper";
import { constantDirection, constantScalar } from "../src/fields/constant";
import { radialGradient } from "../src/fields/radial";
import { type StreamlineParams, traceStreamlines } from "../src/engine/streamlines";
import { orderPaths, penUpTravel } from "../src/engine/order";
import { rdp } from "../src/engine/simplify";
import { FLOW_FIELD_DEFAULTS, penWarning, runFlowField } from "../src/algorithms/flowField";
import { toSvg } from "../src/render/svg";

const P: StreamlineParams = {
  darkestSpacing: 2, lightestSpacing: 2, gamma: 1, clearance: 0.5, minLength: 2, maxLength: 1000,
  maxTurn: 35, stepSize: 0.35, seedOrder: "dark", whiteCut: 1, seed: 3,
};
const grid: Grid = { width: 200, height: 150, mmPerPx: 0.5 }; // 100 × 75 mm

describe("streamline engine", () => {
  it("accepts any DirectionField: a constant field gives straight, evenly spaced lines", () => {
    const { lines } = traceStreamlines({ direction: constantDirection(grid, 0), tone: constantScalar(grid, 0), mmPerPx: grid.mmPerPx, params: P });
    expect(lines.length).toBeGreaterThan(20);
    const ys: number[] = [];
    let drift = 0;
    for (const L of lines) {
      for (let j = 1; j < L.length; j += 2) drift = Math.max(drift, Math.abs(L[j] - L[1]));
      if (pathLength(L) > grid.width * 0.8) ys.push(L[1] * grid.mmPerPx);
    }
    expect(drift).toBeLessThan(1e-3); // horizontal
    ys.sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(P.darkestSpacing * 0.9);
    expect(mean).toBeLessThan(P.darkestSpacing * 1.1);
  });

  it("keeps lines at least clearance × spacing apart", () => {
    const tone = radialGradient(grid, { centreTone: 0, edgeTone: 1, radius: 50 });
    const p = { ...P, darkestSpacing: 1, lightestSpacing: 4 };
    const { lines } = traceStreamlines({ direction: constantDirection(grid, 30), tone, mmPerPx: grid.mmPerPx, params: p });
    const minPx = (p.clearance * p.darkestSpacing) / grid.mmPerPx;
    let closest = Infinity;
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
      const A = lines[a], B = lines[b];
      for (let i = 0; i < A.length; i += 2) for (let j = 0; j < B.length; j += 2)
        closest = Math.min(closest, Math.hypot(A[i] - B[j], A[i + 1] - B[j + 1]));
    }
    expect(lines.length).toBeGreaterThan(10);
    expect(closest).toBeGreaterThan(minPx * 0.999);
  });

  it("darker tone gives denser lines", () => {
    const run = (t: number) => traceStreamlines({ direction: constantDirection(grid, 90), tone: constantScalar(grid, t), mmPerPx: grid.mmPerPx, params: { ...P, darkestSpacing: 1, lightestSpacing: 4 } });
    const ink = (t: number) => run(t).lines.reduce((s, L) => s + pathLength(L), 0);
    expect(ink(0)).toBeGreaterThan(ink(1) * 3);
  });

  it("white cut leaves light areas empty", () => {
    const { lines } = traceStreamlines({ direction: constantDirection(grid, 0), tone: constantScalar(grid, 0.95), mmPerPx: grid.mmPerPx, params: { ...P, whiteCut: 0.9 } });
    expect(lines).toHaveLength(0);
  });

  it("is deterministic for a seed", () => {
    const run = (seed: number) => traceStreamlines({ direction: constantDirection(grid, 45), tone: radialGradient(grid, { centreTone: 0, edgeTone: 1, radius: 40 }), mmPerPx: grid.mmPerPx, params: { ...P, seedOrder: "random", seed, darkestSpacing: 1, lightestSpacing: 3 } }).lines;
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it("rejects mismatched field grids", () => {
    expect(() => traceStreamlines({ direction: constantDirection(grid, 0), tone: constantScalar({ ...grid, width: 10 }, 0), mmPerPx: 1, params: P })).toThrow();
  });
});

describe("simplify and order", () => {
  it("rdp drops collinear points only", () => {
    expect(Array.from(rdp(new Float32Array([0, 0, 1, 0, 2, 0, 3, 1]), 0.01))).toEqual([0, 0, 2, 0, 3, 1]);
  });
  it("ordering never increases pen-up travel and reverses paths when useful", () => {
    const L = [new Float32Array([10, 0, 0, 0]), new Float32Array([50, 50, 60, 50]), new Float32Array([10, 1, 20, 1])];
    const o = orderPaths(L);
    expect(o.travel).toBeLessThanOrEqual(penUpTravel(L));
    expect(Array.from(o.lines[0])).toEqual([0, 0, 10, 0]);
  });
});

describe("flow field algorithm", () => {
  const small = { ...FLOW_FIELD_DEFAULTS, paper: "A5" as const, darkestSpacing: 1, lightestSpacing: 4, radialRadius: 60 };

  it("produces paths in sheet mm inside the margins, with before/after stats", () => {
    const r = runFlowField({ ...small, resolution: 300 });
    const a = r.layout.sheet.area;
    expect(r.paths.length).toBeGreaterThan(50);
    let outside = 0;
    for (const p of r.paths) for (let j = 0; j < p.length; j += 2)
      if (p[j] < a.x || p[j] > a.x + a.width || p[j + 1] < a.y || p[j + 1] > a.y + a.height) outside++;
    expect(outside).toBe(0);
    expect(r.after.travel).toBeLessThan(r.before.travel);
    expect(r.after.time).toBeLessThan(r.before.time);
    expect(r.after.ink).toBeCloseTo(r.before.ink, 3);
  });

  it("parameters are in mm: grid resolution changes precision, not the drawing", () => {
    const lo = runFlowField({ ...small, resolution: 300 }).after, hi = runFlowField({ ...small, resolution: 600 }).after;
    expect(Math.abs(lo.ink - hi.ink) / hi.ink).toBeLessThan(0.1);
  });

  it("warns when darkest spacing < 1.2 × pen width", () => {
    expect(penWarning({ darkestSpacing: 0.35, penWidth: 0.3 })).toMatch(/solid black/);
    expect(penWarning({ darkestSpacing: 0.4, penWidth: 0.3 })).toBeNull();
  });
});

describe("paper and SVG", () => {
  it("has A5 and Square presets and swaps for landscape", () => {
    expect(sheetFor({ paper: "A5", orientation: "portrait", margin: 10, customWidth: 0, customHeight: 0 })).toMatchObject({ width: 148, height: 210 });
    expect(sheetFor({ paper: "Square", orientation: "portrait", margin: 10, customWidth: 0, customHeight: 0 })).toMatchObject({ width: 200, height: 200 });
    expect(sheetFor({ paper: "A3", orientation: "landscape", margin: 10, customWidth: 0, customHeight: 0 })).toMatchObject({ width: 420, height: 297 });
  });
  it("writes mm-unit SVG with one path per line", () => {
    const svg = toSvg({ width: 210, height: 297, penWidth: 0.3, layers: [{ label: "ink", paths: [new Float32Array([1, 2, 3.456, 4])] }] });
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('<path d="M1,2L3.46,4"/>');
    expect(svg).toContain('stroke-width="0.3"');
  });
});
