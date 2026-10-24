import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { wavePortrait } from "../src/algorithms/wavePortrait";
import { defaultParams } from "../src/algorithms/types";
import { parseLayerName, svgLayers } from "../src/export/axidraw";
import { maskGuide, toSvg } from "../src/export/svg";
import { validateGeometry, validateSvgText } from "../src/export/validate";
import { inputFromSvg, maskFromSvg, parsePathData, parseSvg } from "../src/import/svg";
import { runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { type PlotLayerRequest, plotInstructions, plotLayersMeta } from "../src/plotter/plotLayers";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";
import { A3, SEED, headMask, request, sheetA3 } from "./plotLayersFixture";

const ok = { strokeWidth: 0.8, stroke: "#000000" };
const params = { ...defaultParams(wavePortrait), lineSpacing: 2.4 };
const run = (pl: PlotLayerRequest, seed = SEED) =>
  runPipeline({ algorithmId: wavePortrait.id, params, seed, paper: A3, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE, plotLayers: pl });
/** Exactly what the export dialog writes. */
const exportSvg = async (pl: PlotLayerRequest, seed = SEED, onlyLayer?: string) => {
  const r = await run(pl, seed);
  const meta = { algorithm: wavePortrait.id, seed, params, paper: A3, plotLayers: plotLayersMeta(pl, seed) };
  return { r, svg: toSvg(r.geometry, ok, `Plot Lab · ${JSON.stringify(meta)}`, onlyLayer, onlyLayer ? [] : [maskGuide(pl.mask)]) };
};

describe("Plot Layers export (AxiDraw Control)", () => {
  let svg: string, r: Awaited<ReturnType<typeof run>>;
  beforeAll(async () => { ({ svg, r } = await exportSvg(request())); });

  it("writes numbered Inkscape layers in plot order, then the non-plotting mask", () => {
    expect(svgLayers(svg).map((l) => [l.label, l.id])).toEqual([["1 object", "layer-1-object"], ["2 background", "layer-2-background"], ["%mask", "guide-mask"]]);
    // Read the names the way the AxiDraw driver does.
    expect(svgLayers(svg).map((l) => parseLayerName(l.label))).toEqual([
      { skip: false, pause: false, number: 1 }, { skip: false, pause: false, number: 2 }, { skip: true, pause: false, number: null }]);
    expect(svg).toContain('<g id="layer-1-object" inkscape:groupmode="layer" inkscape:label="1 object" fill="none" stroke="#000000" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">');
  });

  it("follows edited layer order and names", async () => {
    const { svg } = await exportSvg(request({ layers: [{ region: "outside", name: "ground" }, { region: "inside", name: "figure" }] }));
    expect(svgLayers(svg).map((l) => l.label)).toEqual(["1 ground", "2 figure", "%mask"]);
  });

  it("passes every export check, with the priming strokes in the margin", () => {
    expect(r.plotLayers!.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(validateGeometry(r.geometry, sheetA3, ok)).toEqual([]);
    expect(validateSvgText(svg, sheetA3)).toEqual([]);
    expect(r.geometry.paths.some((p) => p.prime && p.points.some((q) => q.y > sheetA3.area.y + sheetA3.area.height))).toBe(true);
  });

  it("still blocks priming strokes that fall off the sheet", () => {
    const g = { ...r.geometry, paths: r.geometry.paths.map((p) => (p.prime ? { ...p, points: p.points.map((q) => ({ x: q.x, y: q.y + 20 })) } : p)) };
    expect(validateGeometry(g, sheetA3, ok).map((i) => i.code)).toContain("PRIME_OFF_SHEET");
  });

  it("blocks layer names AxiDraw would plot together or pause on", () => {
    expect(validateSvgText(svg.replace('inkscape:label="2 background"', 'inkscape:label="1b background"'), sheetA3).map((i) => i.code)).toContain("SVG_LAYER_NUMBERS");
    expect(validateSvgText(svg.replace('inkscape:label="2 background"', 'inkscape:label="!2 background"'), sheetA3).map((i) => i.code)).toContain("SVG_LAYER_PAUSE");
  });

  it("rounds every coordinate to 2 decimals", () => {
    const coords = [...svg.matchAll(/<path d="([^"]*)"/g)].flatMap((m) => m[1].match(/-?\d+(\.\d+)?/g)!);
    expect(coords.length).toBeGreaterThan(1000);
    expect(coords.every((c) => !/\.\d{3}/.test(c))).toBe(true);
  });

  it("keeps the params metadata comment and adds every split setting, the mask and the seed", () => {
    const meta = JSON.parse(/<!-- Plot Lab · (.*) -->/.exec(svg)![1]);
    expect(meta.algorithm).toBe("wave-portrait");
    expect(meta.params.lineSpacing).toBe(2.4);
    for (const k of ["flatThresholdMm", "snapSearchMm", "edgeMode", "staggerMm", "seamGapMm", "minSegmentMm", "simplifyToleranceMm", "inkPerPumpMm", "inkSafety", "prime", "layers", "penWidth"])
      expect(meta.plotLayers).toHaveProperty(k);
    expect(meta.plotLayers.seed).toBe(SEED);
    expect(meta.plotLayers.mask).toEqual(headMask().map((p) => [p.x, p.y]));
  });

  it("is byte-identical for the same seed and inputs (feathered edge included)", async () => {
    const f = request({ edgeMode: "feathered" });
    const [a, b, c] = await Promise.all([exportSvg(f), exportSvg(f), exportSvg(f, SEED + 1)]);
    expect(a.svg).toBe(b.svg);
    expect(a.svg).not.toBe(c.svg);
  });

  it("exports each layer as its own file on the same page", async () => {
    const one = (await exportSvg(request(), SEED, "pl2")).svg;
    expect(svgLayers(one).map((l) => l.label)).toEqual(["2 background"]);
    expect(validateSvgText(one, sheetA3)).toEqual([]);
  });

  it("writes plotting instructions in layer order", () => {
    const text = plotInstructions(r.plotLayers!, { inkPerPumpMm: 20_000 }, () => 600);
    expect(text).toMatch(/1\. Layers tab -> layer 1 \("object"\) -> Plot\. [\d.]+ m of ink, about [\d.]+ pumps, est\. 10 min\./);
    expect(text).toContain("wait 10 min (POSCA drying) before layer 2");
    expect(text).toContain("turn path reordering off");
    expect(text).toContain("Don't power off, re-home");
    expect(text.indexOf("layer 1")).toBeLessThan(text.indexOf("layer 2"));
  });
});

describe("SVG import", () => {
  it("reads polylines in mm through units, viewBox and layer transforms, grouped by layer", () => {
    const svg = parseSvg(readFileSync(new URL("./fixtures/inkscape-mask.svg", import.meta.url), "utf8"));
    expect([svg.widthMm, svg.heightMm]).toEqual([210, 297]);
    expect(svg.layers.map((l) => l.name)).toEqual(["rows", "mask", "%notes"]);
    const rows = inputFromSvg(svg);
    const r4 = (p: { x: number; y: number }) => [Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4];
    expect(rows.paths.map((p) => r4(p.points[0]))).toEqual([[20, 100], [20, 150], [20, 200]]); // translate(0,10)
    expect(r4(rows.paths[2].points[rows.paths[2].points.length - 1])).toEqual([190, 200]);
    // The largest closed shape on the mask layer.
    expect(maskFromSvg(svg)!.map(r4)).toEqual([[70, 60], [140, 60], [140, 240], [70, 240]]);
  });

  it("splits an imported drawing by its own mask", async () => {
    const svg = parseSvg(readFileSync(new URL("./fixtures/inkscape-mask.svg", import.meta.url), "utf8"));
    const r = await runPipeline({
      algorithmId: wavePortrait.id, params, seed: 1, paper: { ...A3, paper: "A4" }, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE,
      imported: inputFromSvg(svg), plotLayers: request({ mask: maskFromSvg(svg)! }),
    });
    const ends = (id: string) => r.geometry.paths.filter((p) => p.layerId === id && !p.prime).map((p) => [p.points[0].x, p.points[p.points.length - 1].x].map((x) => Math.round(x * 1e4) / 1e4));
    expect(ends("pl1")).toEqual([[70, 140], [70, 140], [70, 140]]);
    // Background: the left pieces run → and the right pieces ← , both ending at the mask edge.
    expect(ends("pl2")).toEqual([[20, 70], [190, 140], [20, 70], [190, 140], [20, 70], [190, 140]]);
  });

  it("round-trips its own export: the mask comes back from the %mask layer, the rows without it", async () => {
    const { svg } = await exportSvg(request());
    const back = parseSvg(svg);
    expect(maskFromSvg(back)!.map((p) => [p.x, p.y])).toEqual(headMask().map((p) => [p.x, p.y]));
    expect(inputFromSvg(back).paths.length).toBe((await run(request())).geometry.paths.length);
  });

  it("flattens curves and reads relative and shorthand commands", () => {
    const [c] = parsePathData("M0,0 C0,10 10,10 10,0");
    expect(c.points).toHaveLength(17);
    expect(c.points[8][1]).toBeCloseTo(7.5, 9);
    expect(parsePathData("m1,1 h2 v2 l-2,0 z")).toEqual([{ points: [[1, 1], [3, 1], [3, 3], [1, 3]], closed: true }]);
  });
});
