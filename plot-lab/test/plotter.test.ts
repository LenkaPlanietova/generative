import { describe, expect, it } from "vitest";
import type { Point } from "../src/geometry/types";
import { inkDensity } from "../src/plotter/density";
import { DEFAULT_OPTIMIZE, optimize, orderNearest, rdpPoints } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";
import { plotStats } from "../src/plotter/stats";
import { collection, path } from "./helpers";

const off = { dedupe: 0.001, minPathLength: 0, simplify: 0, order: false };

describe("plotter optimisation", () => {
  it("removes duplicate points and zero-length paths", () => {
    const g = optimize(collection([path([[10, 10], [10, 10], [20, 10], [20, 10]]), path([[5, 5], [5, 5]])]), off);
    expect(g.paths).toHaveLength(1);
    expect(g.paths[0].points).toEqual([{ x: 10, y: 10 }, { x: 20, y: 10 }]);
  });

  it("removes paths shorter than the limit", () => {
    const g = optimize(collection([path([[10, 10], [10.3, 10]]), path([[10, 20], [30, 20]])]), { ...off, minPathLength: 0.5 });
    expect(g.paths).toHaveLength(1);
  });

  it("simplification never moves geometry further than the tolerance", () => {
    const pts: Point[] = Array.from({ length: 400 }, (_, i) => ({ x: 20 + i * 0.2, y: 50 + 3 * Math.sin(i * 0.05) }));
    const tol = 0.05, s = rdpPoints(pts, tol);
    expect(s.length).toBeLessThan(pts.length / 4);
    const segDist = (p: Point, a: Point, b: Point) => {
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    for (const p of pts) {
      let d = Infinity;
      for (let i = 1; i < s.length; i++) d = Math.min(d, segDist(p, s[i - 1], s[i]));
      expect(d).toBeLessThanOrEqual(tol + 1e-9);
    }
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("orders by nearest neighbour, reversing open paths but never closed ones", () => {
    const open = path([[100, 0], [1, 0]], false, "ink", "open"), closed = path([[50, 50], [60, 50], [60, 60]], true, "ink", "closed");
    const o = orderNearest([closed, open]);
    expect(o.map((p) => p.id)).toEqual(["open", "closed"]);
    expect(o[0].points[0]).toEqual({ x: 1, y: 0 });
    expect(o[1].points).toEqual(closed.points);
  });

  it("does not merge paths and cuts pen-up travel", () => {
    const paths = Array.from({ length: 50 }, (_, i) => path([[10 + ((i * 37) % 180), 10 + ((i * 53) % 270)], [12 + ((i * 37) % 180), 10 + ((i * 53) % 270)]], false, "ink", `p${i}`));
    const g = collection(paths), o = optimize(g, DEFAULT_OPTIMIZE);
    expect(o.paths).toHaveLength(50);
    expect(new Set(o.paths.map((p) => p.id)).size).toBe(50);
    expect(plotStats(o, DEFAULT_PROFILE).penUp).toBeLessThan(plotStats(g, DEFAULT_PROFILE).penUp);
  });
});

describe("plot statistics", () => {
  it("measures paths, points, pen-down, pen-up and time", () => {
    const g = collection([path([[0, 10], [30, 10]]), path([[30, 20], [30, 60]]), path([[0, 0], [10, 0], [10, 10]], true)]);
    const s = plotStats(g, { penDownSpeed: 10, penUpSpeed: 20, penLiftDelay: 1 });
    expect(s).toMatchObject({ paths: 3, points: 7, penLifts: 3 });
    expect(s.penDown).toBeCloseTo(30 + 40 + 10 + 10 + Math.SQRT2 * 10, 6);
    expect(s.penUp).toBeCloseTo(10 + 10 + Math.hypot(30, 60), 6);
    expect(s.time).toBeCloseTo(s.penDown / 10 + s.penUp / 20 + 3, 6);
  });
});

describe("ink density", () => {
  it("flags lines packed closer than the pen width", () => {
    const dense = collection(Array.from({ length: 100 }, (_, i) => path([[20, 20 + i * 0.1], [80, 20 + i * 0.1]], false, "ink", `d${i}`)));
    const sparse = collection(Array.from({ length: 20 }, (_, i) => path([[20, 20 + i * 2], [80, 20 + i * 2]], false, "ink", `s${i}`)));
    expect(inkDensity(dense, 0.3).saturated).toBeGreaterThan(0.9);
    expect(inkDensity(sparse, 0.3).saturated).toBe(0);
  });
});
