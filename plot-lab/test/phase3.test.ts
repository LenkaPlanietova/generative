import { describe, expect, it } from "vitest";
import { guilloche } from "../src/algorithms/guilloche";
import { interference } from "../src/algorithms/interference";
import { moire } from "../src/algorithms/moire";
import { MAX_CELLS, reactionDiffusion } from "../src/algorithms/reactionDiffusion";
import { topographic } from "../src/algorithms/topographic";
import { defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER } from "../src/core/paper";
import { type NoiseType, noiseSampler } from "../src/fields/noise";
import { toSvg } from "../src/export/svg";
import { optimize, DEFAULT_OPTIMIZE } from "../src/plotter/optimize";

const square = { ...DEFAULT_PAPER, paper: "Square" as const }; // area 160 × 160 at (20, 20), centre (100, 100)

describe("advanced noise", () => {
  for (const t of ["gradient", "ridged", "billow", "warped"] as NoiseType[]) {
    it(`${t} noise is deterministic and bounded`, () => {
      const f = noiseSampler(t, 3, 4, 1), g = noiseSampler(t, 3, 4, 1);
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 2000; i++) {
        const u = (i % 50) * 0.13, v = Math.floor(i / 50) * 0.17, x = f(u, v);
        expect(x).toBe(g(u, v));
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
      expect(lo).toBeGreaterThan(-1.5);
      expect(hi).toBeLessThan(1.5);
      expect(hi - lo).toBeGreaterThan(0.3);
    });
  }
});

describe("Moiré", () => {
  it("puts each line system on its own SVG layer", async () => {
    const g = await moire.generate({ params: { ...defaultParams(moire), layerCount: 3, step: 1.5 }, seed: 1, paper: square });
    expect(g.layers.map((l) => l.id)).toEqual(["layer1", "layer2", "layer3"]);
    for (const l of g.layers) expect(g.paths.some((p) => p.layerId === l.id)).toBe(true);
    expect(toSvg(g, { strokeWidth: 0.3 }).match(/inkscape:groupmode="layer"/g)).toHaveLength(3);
    // The optimiser keeps layers together, in order.
    const order = optimize(g, DEFAULT_OPTIMIZE).paths.map((p) => p.layerId);
    expect(order).toEqual([...order].sort());
  });
  it("mixed pattern alternates lines and closed rings", async () => {
    const g = await moire.generate({ params: { ...defaultParams(moire), pattern: "mixed", distortion: 0, lens: 0, step: 1.5 }, seed: 1, paper: square });
    expect(g.layers[1].name).toMatch(/rings/);
    expect(g.paths.filter((p) => p.layerId === "layer2").some((p) => p.closed)).toBe(true);
    expect(g.paths.filter((p) => p.layerId === "layer1").every((p) => !p.closed)).toBe(true);
  });
});

describe("Guilloché", () => {
  it("draws bands × repetitions closed curves when the rosette fits", async () => {
    const g = await guilloche.generate({ params: { ...defaultParams(guilloche), bands: 2, repetitions: 5, baseRadius: 20, lineSpacing: 15, segment: 1 }, seed: 1, paper: square });
    expect(g.paths).toHaveLength(10);
    expect(g.paths.every((p) => p.closed)).toBe(true);
  });
});

describe("Interference", () => {
  it("a single source gives rings at every half wavelength", async () => {
    const params = { ...defaultParams(interference), sources: 1, spread: 0, attenuation: 0, contourCount: 1, wavelength: 10, smoothing: 0, resolution: 400 };
    const g = await interference.generate({ params, seed: 1, paper: square });
    for (const p of g.paths) for (const q of p.points) {
      const d = Math.hypot(q.x - 100, q.y - 100), m = d / 5;
      expect(Math.abs(m - Math.round(m))).toBeLessThan(0.08);
    }
    expect(g.paths.filter((p) => p.closed).length).toBeGreaterThanOrEqual(10);
  });
});

describe("Topographic Fields", () => {
  it("puts the coastline and every Nth contour on the index layer", async () => {
    const params = { ...defaultParams(topographic), contourCount: 20, indexEvery: 5, resolution: 160 };
    const g = await topographic.generate({ params, seed: 4, paper: square });
    expect(g.layers.map((l) => l.id)).toEqual(["contours", "index"]);
    const idx = g.paths.filter((p) => p.layerId === "index").length, rest = g.paths.filter((p) => p.layerId === "contours").length;
    expect(idx).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(idx);
    const none = await topographic.generate({ params: { ...params, indexEvery: 0 }, seed: 4, paper: square });
    expect(none.paths.filter((p) => p.layerId === "index").length).toBeLessThan(idx); // coastline only
  });
});

describe("Reaction-Diffusion", () => {
  it("grows a pattern and exports it as closed vector outlines", async () => {
    const g = await reactionDiffusion.generate({ params: { ...defaultParams(reactionDiffusion), iterations: 1500, cellSize: 1.5 }, seed: 2, paper: square });
    expect(g.paths.length).toBeGreaterThan(5);
    expect(g.paths.filter((p) => p.closed).length).toBeGreaterThan(0);
  });
  it("refuses a grid over the safety limit instead of freezing", async () => {
    const big = { ...DEFAULT_PAPER, paper: "A2" as const };
    await expect(reactionDiffusion.generate({ params: { ...defaultParams(reactionDiffusion), cellSize: 0.4 }, seed: 1, paper: big }))
      .rejects.toThrow(/Pattern scale is too fine/);
    expect(MAX_CELLS).toBeGreaterThan(100_000);
  });
  it("stops early when cancelled", async () => {
    const ctrl = new AbortController();
    let steps = 0;
    const g = reactionDiffusion.generate({
      params: { ...defaultParams(reactionDiffusion), iterations: 20000, cellSize: 2 }, seed: 1, paper: square, signal: ctrl.signal,
      onProgress: () => { if (++steps === 3) ctrl.abort(); },
    });
    await g;
    expect(steps).toBeLessThan(10);
  });
});
