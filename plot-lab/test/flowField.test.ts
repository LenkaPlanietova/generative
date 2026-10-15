import { describe, expect, it } from "vitest";
import { flowField } from "../src/algorithms/flowField";
import { defaultParams, resolveParams } from "../src/algorithms/types";
import { DEFAULT_PAPER, type PaperSettings, sheetFor } from "../src/core/paper";
import { runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";

// Coarse field and wider spacing keep the tests fast; behaviour is the same at full resolution.
const params = { ...defaultParams(flowField), resolution: 300, darkestSpacing: 1, lightestSpacing: 4 };
const gen = (over: Record<string, unknown> = {}, seed = 7, paper: PaperSettings = DEFAULT_PAPER) =>
  flowField.generate({ params: { ...params, ...over } as never, seed, paper });

describe("Flow Field algorithm", () => {
  it("implements the plugin interface with a default for every parameter", () => {
    expect(flowField.id).toBe("flow-field");
    for (const p of flowField.parameters) {
      expect(p.description.length).toBeGreaterThan(5);
      if (p.type === "number") {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
        expect(p.step).toBeGreaterThan(0);
      }
    }
    expect(new Set(flowField.parameters.map((p) => p.id)).size).toBe(flowField.parameters.length);
  });

  it("is deterministic: same settings and seed give identical geometry", async () => {
    expect(await gen()).toEqual(await gen());
  });

  it("different seeds give different geometry", async () => {
    expect((await gen({}, 7)).paths).not.toEqual((await gen({}, 8)).paths);
  });

  it("every parameter that's exposed changes the result (sample)", async () => {
    const base = await gen();
    for (const [id, v] of [["noiseSize", 30], ["offset", 45], ["darkestSpacing", 1.5], ["maxTurn", 15], ["wobble", 30], ["density", "constant"], ["centreX", 40]] as const)
      expect((await gen({ [id]: v })).paths, id).not.toEqual(base.paths);
  });

  for (const [name, paper] of [
    ["A4 portrait", DEFAULT_PAPER],
    ["A3 landscape", { ...DEFAULT_PAPER, paper: "A3", orientation: "landscape" }],
    ["A2, 35 mm margin", { ...DEFAULT_PAPER, paper: "A2", margin: 35 }],
    ["custom 150 × 120", { ...DEFAULT_PAPER, paper: "Custom", customWidth: 150, customHeight: 120 }],
  ] as [string, PaperSettings][]) {
    it(`stays inside the margins on ${name}`, async () => {
      const sheet = sheetFor(paper), g = await gen({}, 3, paper), a = sheet.area;
      expect(g.widthMm).toBe(sheet.width);
      expect(g.heightMm).toBe(sheet.height);
      expect(g.paths.length).toBeGreaterThan(20);
      let bad = 0;
      for (const p of g.paths) for (const q of p.points)
        if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || q.x < a.x || q.y < a.y || q.x > a.x + a.width || q.y > a.y + a.height) bad++;
      expect(bad).toBe(0);
    });
  }

  it("parameters are in mm: field resolution changes precision, not the drawing", async () => {
    const run = (resolution: number) => runPipeline({ algorithmId: "flow-field", params: { ...params, resolution }, seed: 7, paper: DEFAULT_PAPER, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE });
    const lo = (await run(300)).after.penDown, hi = (await run(600)).after.penDown;
    expect(Math.abs(lo - hi) / hi).toBeLessThan(0.1);
  });

  it("respects the line count limit", async () => {
    expect((await gen({ maxLines: 12 })).paths).toHaveLength(12);
  });

  it("clamps out-of-range and missing parameter values", () => {
    const r = resolveParams(flowField, { darkestSpacing: -5, maxTurn: Number.NaN, density: "nope" });
    expect(r.darkestSpacing).toBe(0.2);
    expect(r.maxTurn).toBe(35);
    expect(r.density).toBe("radial");
    expect(r.noiseSize).toBe(60);
  });
});

describe("pipeline", () => {
  it("optimisation cuts pen-up travel and keeps ink", async () => {
    const r = await runPipeline({ algorithmId: "flow-field", params, seed: 7, paper: DEFAULT_PAPER, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE });
    expect(r.after.penUp).toBeLessThan(r.before.penUp * 0.5);
    expect(r.after.time).toBeLessThan(r.before.time);
    expect(Math.abs(r.after.penDown - r.before.penDown) / r.before.penDown).toBeLessThan(0.01);
  });
  it("rejects unknown algorithms", async () => {
    await expect(runPipeline({ algorithmId: "nope", params: {}, seed: 1, paper: DEFAULT_PAPER, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE })).rejects.toThrow();
  });
});
