/**
 * Contract tests run against every registered algorithm: determinism, finite in-margin geometry on every paper,
 * valid export, and every control changing the drawing.
 */
import { describe, expect, it } from "vitest";
import { ALGORITHMS } from "../src/algorithms/registry";
import { type GenerativeAlgorithm, type ParameterDefinition, type ParamValues, defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER, type PaperSettings, sheetFor } from "../src/core/paper";
import { toSvg } from "../src/export/svg";
import { validateGeometry, validateSvgText } from "../src/export/validate";

// Lighter settings so the suite stays fast (only applied where the parameter exists).
const LIGHT: ParamValues = { resolution: 250, darkestSpacing: 1.2, lightestSpacing: 4 };
const base = (a: GenerativeAlgorithm): ParamValues => {
  const d = defaultParams(a);
  for (const [k, val] of Object.entries(LIGHT)) if (k in d && a.id === "flow-field") d[k] = val;
  if (a.id === "contour") d.resolution = 200;
  if (a.id === "harmonograph") d.resolution = 40;
  if (a.id === "lissajous") d.resolution = 1500;
  if (a.id === "reaction-diffusion") { d.iterations = 800; d.cellSize = 2; }
  if (a.id === "noise-flow") { d.resolution = 250; d.lineSpacing = 3; }
  if (a.id === "topographic") d.resolution = 160;
  if (a.id === "interference") d.resolution = 240;
  if (a.id === "guilloche") d.segment = 1;
  if (a.id === "moire") d.step = 1.5;
  if (a.id === "redraw" || a.id === "contour-portrait") { d.resolution = 300; d.darkestSpacing = 1; d.lightestSpacing = 3; d.maxLines = 400; }
  if (a.id === "wave-portrait") d.step = 0.4;
  if (a.id === "displacement" || a.id === "hatching") d.step = 0.6;
  return d;
};
const run = (a: GenerativeAlgorithm, params: ParamValues, seed = 5, paper: PaperSettings = DEFAULT_PAPER) => a.generate({ params, seed, paper });

/**
 * Values to try for a parameter: each other option of a select / boolean (all must change the drawing), or
 * for a number one step up and one down by 37 % of the range (either changing it is enough — limits only bite one way).
 */
function otherValues(p: ParameterDefinition, cur: ParamValues[string]): { all: ParamValues[string][] } | { any: ParamValues[string][] } {
  if (p.type === "boolean") return { all: [!cur] };
  if (p.type === "select") return { all: p.options.map((o) => o.value).filter((x) => x !== cur) };
  const span = p.max - p.min, snap = (x: number) => Math.min(p.max, Math.max(p.min, p.min + Math.round((x - p.min) / p.step) * p.step));
  return { any: [snap((cur as number) + span * 0.37), snap((cur as number) - span * 0.37)].filter((x) => x !== cur) };
}

/** Settings in which `p` is visible: defaults, or with one select/boolean switched. */
function contextFor(a: GenerativeAlgorithm, p: ParameterDefinition, d: ParamValues): ParamValues | null {
  if (!p.visibleWhen || p.visibleWhen(d)) return d;
  for (const q of a.parameters) {
    const opts = q.type === "select" ? q.options.map((o) => o.value) : q.type === "boolean" ? [true, false] : q.type === "number" ? [q.max, q.min + q.step] : [];
    for (const o of opts) { const c = { ...d, [q.id]: o }; if (p.visibleWhen(c)) return c; }
  }
  return null;
}

for (const algo of ALGORITHMS) {
  describe(`${algo.name}`, () => {
    it("has a complete, valid parameter list", () => {
      expect(new Set(algo.parameters.map((p) => p.id)).size).toBe(algo.parameters.length);
      for (const p of algo.parameters) {
        expect(p.label && p.description, p.id).toBeTruthy();
        if (p.type === "number") { expect(p.default, p.id).toBeGreaterThanOrEqual(p.min); expect(p.default, p.id).toBeLessThanOrEqual(p.max); }
        if (p.type === "select") expect(p.options.map((o) => o.value), p.id).toContain(p.default);
      }
    });

    it("is deterministic", async () => {
      const d = base(algo);
      expect(await run(algo, d, 9)).toEqual(await run(algo, d, 9));
    });

    for (const [name, paper] of [
      ["A4", DEFAULT_PAPER], ["A3 landscape", { ...DEFAULT_PAPER, paper: "A3", orientation: "landscape" }],
      ["A5, 10 mm margin", { ...DEFAULT_PAPER, paper: "A5", margin: 10 }], ["custom 120 × 300", { ...DEFAULT_PAPER, paper: "Custom", customWidth: 120, customHeight: 300 }],
    ] as [string, PaperSettings][]) {
      it(`produces finite geometry inside the margins and a valid SVG (${name})`, async () => {
        const g = await run(algo, base(algo), 5, paper), sheet = sheetFor(paper), s = { strokeWidth: 0.3, stroke: "#000000" };
        expect(g.paths.length).toBeGreaterThan(0);
        expect(validateGeometry(g, sheet, s)).toEqual([]);
        expect(validateSvgText(toSvg(g, s), sheet)).toEqual([]);
      });
    }

    it("every control changes the drawing", async () => {
      const d = base(algo), failures: string[] = [];
      for (const p of algo.parameters) {
        const ctx = contextFor(algo, p, d);
        if (!ctx) { failures.push(`${p.id}: never visible`); continue; }
        const ref = JSON.stringify((await run(algo, ctx)).paths);
        const differs = async (val: ParamValues[string]) => JSON.stringify((await run(algo, { ...ctx, [p.id]: val })).paths) !== ref;
        const o = otherValues(p, ctx[p.id]);
        if ("all" in o) { for (const val of o.all) if (!(await differs(val))) failures.push(`${p.id}=${String(val)}`); }
        else {
          let any = false;
          for (const val of o.any) if (await differs(val)) { any = true; break; }
          if (!any) failures.push(`${p.id}: no effect at ${o.any.join(" / ")}`);
        }
      }
      expect(failures).toEqual([]);
    }, 120_000);

    it("the seed matters exactly when the algorithm says it does", async () => {
      const d = base(algo), uses = algo.usesSeed ? algo.usesSeed(d) : true;
      const same = JSON.stringify((await run(algo, d, 1)).paths) === JSON.stringify((await run(algo, d, 2)).paths);
      expect(same).toBe(!uses);
    });
  });
}
