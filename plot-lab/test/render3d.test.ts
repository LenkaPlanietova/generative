import { describe, expect, it } from "vitest";
import { DepthBuffer, type P3, camera, visibleRuns } from "../src/render3d/hidden";

/** A square wall at depth `z` covering x, y ∈ [x0, x1]. */
const wall = (buf: DepthBuffer, x0: number, x1: number, z: number) => {
  const p = (x: number, y: number): P3 => ({ x, y, z });
  buf.triangle(p(x0, x0), p(x1, x0), p(x1, x1));
  buf.triangle(p(x0, x0), p(x1, x1), p(x0, x1));
};
const line = (x0: number, x1: number, y: number, z: number, n = 50): P3[] => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y, z }));
const span = (r: { x: number }[]) => [Math.min(...r.map((p) => p.x)), Math.max(...r.map((p) => p.x))];

describe("depth buffer", () => {
  it("keeps the nearest surface", () => {
    const b = new DepthBuffer(0, 0, 100, 100, 1);
    wall(b, 0, 100, -5);
    wall(b, 40, 60, 3);
    expect(b.depthAt(50, 50)).toBe(3);
    expect(b.depthAt(10, 50)).toBe(-5);
    expect(b.depthAt(500, 50)).toBe(-Infinity);
  });
});

describe("hidden lines", () => {
  const b = new DepthBuffer(0, 0, 100, 100, 0.5);
  wall(b, 0, 100, 0);
  wall(b, 40, 60, 10); // a block in front of the middle

  it("cuts a line where something nearer covers it", () => {
    const runs = visibleRuns(line(10, 90, 50, 0), false, b, 0.5, 0);
    expect(runs).toHaveLength(2);
    expect(span(runs[0])[1]).toBeCloseTo(40, 0);
    expect(span(runs[1])[0]).toBeCloseTo(60, 0);
  });

  it("keeps a line in front of everything whole", () => {
    expect(visibleRuns(line(10, 90, 50, 20), false, b, 0.5, 0)).toHaveLength(1);
  });

  it("bridges short hidden gaps and drops short flecks", () => {
    const c = new DepthBuffer(0, 0, 100, 100, 0.5);
    wall(c, 0, 100, 0);
    wall(c, 49, 50, 10); // a 1 mm post
    expect(visibleRuns(line(10, 90, 49.5, 0), false, c, 0.5, 0)).toHaveLength(2);
    expect(visibleRuns(line(10, 90, 49.5, 0), false, c, 0.5, 0, 2)).toHaveLength(1);
    // Only 3 mm of this line pokes out past the block's edge: dropped as a fleck.
    expect(visibleRuns(line(37, 55, 50, 0), false, b, 0.5, 5)).toHaveLength(0);
    expect(visibleRuns(line(37, 55, 50, 0), false, b, 0.5, 1)).toHaveLength(1);
  });

  it("joins a closed loop's pieces across its start", () => {
    const ring = Array.from({ length: 200 }, (_, i): P3 => ({ x: 50 + 30 * Math.cos((i / 200) * 2 * Math.PI), y: 50 + 30 * Math.sin((i / 200) * 2 * Math.PI), z: 0 }));
    const c = new DepthBuffer(0, 0, 100, 100, 0.5);
    wall(c, 0, 100, 0);
    const p = (x: number, y: number): P3 => ({ x, y, z: 10 });
    c.triangle(p(40, 0), p(60, 0), p(60, 40)); c.triangle(p(40, 0), p(60, 40), p(40, 40)); // covers the top of the ring
    const runs = visibleRuns(ring, true, c, 0.5, 0);
    expect(runs).toHaveLength(1); // one piece, running through the ring's start at angle 0
    expect(visibleRuns(ring, true, new DepthBuffer(0, 0, 100, 100, 0.5), 0.5, 0)).toHaveLength(1);
  });
});

describe("camera", () => {
  it("looks down the z axis at 0° and turns about x with tilt", () => {
    const top = camera({ spin: 0, tilt: 0, turn: 0, cx: 100, cy: 100, perspective: 0, extent: 50 });
    expect(top(10, 0, 0)).toMatchObject({ x: 110, y: 100 });
    expect(top(0, 10, 0).y).toBeCloseTo(90, 9); // +y is up the sheet
    const side = camera({ spin: 0, tilt: 90, turn: 0, cx: 100, cy: 100, perspective: 0, extent: 50 });
    expect(side(0, 0, 10).y).toBeCloseTo(90, 9); // tilted 90°: height becomes up
    expect(side(0, 10, 0).z).toBeCloseTo(-10, 9); // and the far side recedes
  });

  it("makes nearer things bigger with perspective", () => {
    const c = camera({ spin: 0, tilt: 0, turn: 0, cx: 0, cy: 0, perspective: 0.5, extent: 50 });
    expect(c(10, 0, 20).x).toBeGreaterThan(c(10, 0, -20).x);
  });
});
