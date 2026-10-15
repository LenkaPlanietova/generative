import { describe, expect, it } from "vitest";
import type { Grid } from "../src/core/fields";
import { pathLength } from "../src/core/path";
import { constantDirection, constantScalar } from "../src/fields/constant";
import { radialGradient } from "../src/fields/radial";
import { type StreamlineParams, traceStreamlines } from "../src/engine/streamlines";

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


describe("engine safety limits", () => {
  it("stops at maxLines", () => {
    const { lines } = traceStreamlines({ direction: constantDirection(grid, 0), tone: constantScalar(grid, 0), mmPerPx: grid.mmPerPx, params: P, maxLines: 5 });
    expect(lines).toHaveLength(5);
  });
  it("stops when asked to", () => {
    const { lines } = traceStreamlines({ direction: constantDirection(grid, 0), tone: constantScalar(grid, 0), mmPerPx: grid.mmPerPx, params: P, shouldStop: () => true });
    expect(lines).toHaveLength(0);
  });
});
