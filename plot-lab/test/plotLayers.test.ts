import { beforeAll, describe, expect, it } from "vitest";
import { rng } from "../src/core/rng";
import { polylineLength } from "../src/geometry/convert";
import { indexMask } from "../src/geometry/mask";
import type { GeometryCollection, Point } from "../src/geometry/types";
import {
  type PlotLayerRequest, type Rect, type RowSplit, DEFAULT_PLOT_LAYERS, FLAT_WINDOW_MM, cleanLayerName, densify, forwards, primeSpots, sanitizePlotLayers, splitPlotLayers, splitRow,
} from "../src/plotter/plotLayers";
import { defaultParams } from "../src/algorithms/types";
import { wavePortrait } from "../src/algorithms/wavePortrait";
import { DEFAULT_CLIP } from "../src/geometry/clipShape";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";
import { makeProject, parseProject } from "../src/project/project";
import { A3, SEED, headMask, request, sheetA3, waveRows } from "./plotLayersFixture";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const opts = (o: Partial<PlotLayerRequest> = {}) => request(o);

/**
 * Independent check of flatness: the row's own least-squares line y = a + bx, and the original points within ±window/2
 * of the cut along that line (shrunk by 0.01 mm, so a point the split's own window might leave out is never counted).
 */
function deviationAt(row: Point[], cut: Point): number {
  const n = row.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of row) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, k = Math.sqrt(1 + b * b);
  const along = (p: Point) => (p.x + b * p.y) / k, uc = along(cut);
  let m = 0;
  for (const p of row) if (Math.abs(along(p) - uc) <= FLAT_WINDOW_MM / 2 - 0.01) m = Math.max(m, Math.abs(p.y - (a + b * p.x)) / k);
  return m;
}

describe("Plot Layers: row split on the Wave Portrait fixture", () => {
  let g: GeometryCollection, splits: { row: Point[]; split: RowSplit }[], raw: { row: Point[]; split: RowSplit }[];
  const mask = indexMask(headMask());
  beforeAll(async () => {
    g = await waveRows();
    const r = rng(1), r0 = rng(1);
    splits = g.paths.map((p) => ({ row: p.points, split: splitRow(p.points, false, mask, opts(), r) }));
    raw = g.paths.map((p) => ({ row: p.points, split: splitRow(p.points, false, mask, opts({ simplifyToleranceMm: 0 }), r0) }));
  });

  it("uses the intended fixture: A3, ~150 rows, the mask crossing most of them", () => {
    expect(g.paths.length).toBeGreaterThanOrEqual(140);
    expect(g.paths.length).toBeLessThanOrEqual(170);
    expect(splits.filter((s) => s.split.cuts.length > 0).length).toBeGreaterThan(100);
  });

  it("covers every row exactly: pieces tile [0, length] with no gap, overlap or duplicate", () => {
    for (const { split } of splits) {
      const ps = split.pieces.slice().sort((a, b) => a.s0 - b.s0);
      expect(ps[0].s0).toBe(0);
      expect(ps[ps.length - 1].s1).toBeCloseTo(split.length, 9);
      for (let k = 1; k < ps.length; k++) {
        expect(ps[k].s0).toBe(ps[k - 1].s1); // butt joint, seam gap 0
        expect(ps[k].region).not.toBe(ps[k - 1].region);
      }
    }
  });

  it("loses no point: without simplification the pieces put back together are the original row", () => {
    for (const { row, split } of raw) {
      const joined: Point[] = [];
      for (const p of split.pieces.slice().sort((a, b) => a.s0 - b.s0)) {
        const pts = p.reversed ? p.points.slice().reverse() : p.points;
        joined.push(...(joined.length ? pts.slice(1) : pts));
      }
      const orig = forwards(row) ? row : row.slice().reverse(), dense = densify(orig), cuts = split.cuts.map((c) => c.point);
      // The row as analysed (long segments subdivided on the line), vertex for vertex, plus a point at each cut that
      // falls between vertices; it contains every original vertex in order.
      let j = 0;
      for (const q of joined) {
        if (j < dense.length && dist(q, dense[j]) < 1e-9) j++;
        else expect(cuts.some((c) => dist(c, q) < 1e-9)).toBe(true);
      }
      expect(j).toBe(dense.length);
      j = 0;
      for (const q of joined) if (j < orig.length && dist(q, orig[j]) < 1e-12) j++;
      expect(j).toBe(orig.length);
      const total = split.pieces.reduce((a, p) => a + polylineLength(p.points), 0);
      expect(total).toBeCloseTo(polylineLength(row), 6);
    }
  });

  it("simplification keeps piece ends and stays within its tolerance", () => {
    for (let i = 0; i < splits.length; i += 15) {
      const a = splits[i].split.pieces, b = raw[i].split.pieces;
      expect(a.length).toBe(b.length);
      a.forEach((p, k) => {
        expect(dist(p.points[0], b[k].points[0])).toBeLessThan(1e-9);
        expect(dist(p.points[p.points.length - 1], b[k].points[b[k].points.length - 1])).toBeLessThan(1e-9);
        // Each dropped vertex is within tolerance of the simplified polyline.
        for (const q of b[k].points) {
          let d = Infinity;
          for (let j = 0; j + 1 < p.points.length; j++) {
            const u = p.points[j], v = p.points[j + 1], dx = v.x - u.x, dy = v.y - u.y, L = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((q.x - u.x) * dx + (q.y - u.y) * dy) / L));
            d = Math.min(d, Math.hypot(u.x + t * dx - q.x, u.y + t * dy - q.y));
          }
          expect(d).toBeLessThanOrEqual(DEFAULT_PLOT_LAYERS.simplifyToleranceMm + 1e-9);
        }
      });
    }
  });

  it("never cuts where the line deviates more than flatThresholdMm, unless the cut is flagged", () => {
    let flat = 0, flagged = 0;
    for (const { row, split } of splits) for (const c of split.cuts) {
      if (c.flagged) { flagged++; continue; }
      flat++;
      expect(deviationAt(row, c.point)).toBeLessThanOrEqual(DEFAULT_PLOT_LAYERS.flatThresholdMm + 0.002);
    }
    expect(flat).toBeGreaterThan(50); // the fixture exercises both cases
    expect(flagged).toBeGreaterThan(0);
  });

  it("follows the stroke direction rules for every segment type", () => {
    let types = new Set<string>();
    for (const { split } of splits) {
      const seams = split.cuts.map((c) => c.point);
      for (const p of split.pieces) {
        const first = p.points[0], last = p.points[p.points.length - 1], atSeam = (q: Point) => seams.some((s) => dist(s, q) < 1e-9);
        if (p.region === "inside") { types.add("object"); expect(last.x).toBeGreaterThan(first.x); expect(p.reversed).toBe(false); continue; }
        if (p.cutStart && !p.cutEnd) { types.add("bg-right"); expect(last.x).toBeLessThan(first.x); expect(atSeam(last)).toBe(true); }
        else if (p.cutEnd && !p.cutStart) { types.add("bg-left"); expect(last.x).toBeGreaterThan(first.x); expect(atSeam(last)).toBe(true); }
        else { types.add(p.cutStart ? "bg-middle" : "bg-free"); expect(last.x).toBeGreaterThan(first.x); }
      }
    }
    expect([...types].sort()).toEqual(["bg-free", "bg-left", "bg-middle", "bg-right", "object"]);
  });

  it("leaves no cut piece shorter than minSegmentMm (whole uncut rows are the generator's own)", () => {
    for (const { split } of splits) for (const p of split.pieces)
      if (p.cutStart || p.cutEnd) expect(p.s1 - p.s0).toBeGreaterThanOrEqual(DEFAULT_PLOT_LAYERS.minSegmentMm);
  });
});

describe("Plot Layers: snapping and edges on synthetic rows", () => {
  /** y = 100 from x = 0 to 200, a 1 mm sine wave between x0 and x1, 0.1 mm steps. */
  const row = (x0: number, x1: number): Point[] => Array.from({ length: 2001 }, (_, i) => {
    const x = i / 10;
    return { x, y: 100 + (x > x0 && x < x1 ? Math.sin((x - x0) * 2 * Math.PI) : 0) };
  });
  const rect = (x0: number, x1: number) => indexMask([{ x: x0, y: 50 }, { x: x1, y: 50 }, { x: x1, y: 150 }, { x: x0, y: 150 }]);
  const o = (over: Partial<PlotLayerRequest> = {}) => opts({ simplifyToleranceMm: 0, ...over });
  const cutX = (r: RowSplit) => r.cuts.map((c) => c.point.x);

  it("cuts exactly at the mask edge where the line is flat", () => {
    const r = splitRow(row(0, 0), false, rect(50, 120), o(), rng(1));
    expect(cutX(r)).toEqual([50, 120]);
    expect(r.cuts.every((c) => !c.flagged)).toBe(true);
  });

  it("moves a cut off a wave, preferring outwards (into the background)", () => {
    // Edge at x = 104 inside a wave on 100–110: flat inwards at ≤ 99.5 (4.5 mm), outwards at ≥ 110.5 (6.5 mm).
    const r = splitRow(row(100, 110), false, rect(50, 104), o({ snapSearchMm: 8 }), rng(1));
    expect(cutX(r)[1]).toBeCloseTo(110.5, 6);
    expect(r.cuts[1].flagged).toBe(false);
    // Much closer inwards than outwards: inwards wins.
    const r2 = splitRow(row(100, 120), false, rect(50, 101), o({ snapSearchMm: 20 }), rng(1));
    expect(cutX(r2)[1]).toBeCloseTo(99.5, 6);
  });

  it("flags the cut and uses a zero crossing or peak when no flat point is in reach", () => {
    const r = splitRow(row(80, 130), false, rect(50, 104.3), o(), rng(1));
    const c = r.cuts[1];
    expect(c.flagged).toBe(true);
    expect(Math.abs(c.point.x - 104.3)).toBeLessThanOrEqual(4);
    const phase = ((c.point.x - 80) * 4) % 1; // zero crossings at 0 and 0.5 wavelengths, peaks at 0.25 and 0.75
    expect(Math.min(...[0, 0.25, 0.5, 0.75, 1].map((p) => Math.abs(phase - p)))).toBeLessThan(0.06);
  });

  it("feathered edges stagger each cut outwards by up to staggerMm, deterministically", () => {
    const rows = Array.from({ length: 30 }, () => row(0, 0));
    const a = rows.map((p) => splitRow(p, false, rect(50, 120), o({ edgeMode: "feathered" }), rng(9)));
    const r = rng(9), b = rows.map((p) => splitRow(p, false, rect(50, 120), o({ edgeMode: "feathered" }), r));
    // Outwards: left cut moves left of 50, right cut right of 120, never by more than the stagger.
    for (const s of b) {
      expect(s.cuts[0].point.x).toBeLessThanOrEqual(50);
      expect(s.cuts[0].point.x).toBeGreaterThanOrEqual(50 - 3 - 0.1);
      expect(s.cuts[1].point.x).toBeGreaterThanOrEqual(120);
      expect(s.cuts[1].point.x).toBeLessThanOrEqual(120 + 3 + 0.1);
    }
    expect(new Set(b.map((s) => s.cuts[1].point.x)).size).toBeGreaterThan(10); // the seam is staggered
    expect(a.map(cutX)).toEqual(Array.from({ length: 30 }, () => cutX(a[0]))); // same rng state, same cuts
  });

  it("feathering never moves a cut onto a wave", () => {
    // Waves just outside the right edge: the staggered cut can only land where it's flat, or falls back to crisp.
    const r = rng(3);
    for (let k = 0; k < 40; k++) {
      const s = splitRow(row(121, 200), false, rect(50, 120), o({ edgeMode: "feathered" }), r);
      expect(s.cuts[1].flagged).toBe(false);
      expect(s.cuts[1].point.x).toBeLessThanOrEqual(120.5 + 1e-9);
    }
  });

  it("applies the seam gap to the background only: positive leaves a gap, negative overlaps", () => {
    for (const gap of [0.4, -0.3]) {
      const r = splitRow(row(0, 0), false, rect(50, 120), o({ seamGapMm: gap }), rng(1));
      const [left, body, right] = r.pieces;
      expect(body.s0).toBeCloseTo(50, 9);
      expect(body.s1).toBeCloseTo(120, 9);
      expect(body.s0 - left.s1).toBeCloseTo(gap, 9);
      expect(right.s0 - body.s1).toBeCloseTo(gap, 9);
    }
  });

  it("merges micro-fragments into the neighbouring layer", () => {
    // A 1 mm sliver of mask and a 0.8 mm gap between two mask parts.
    const sliver = splitRow(row(0, 0), false, rect(60, 61), o(), rng(1));
    expect(sliver.pieces.map((p) => p.region)).toEqual(["outside"]);
    const twoParts = indexMask([{ x: 40, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 120 }, { x: 100.8, y: 120 }, { x: 100.8, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 40, y: 150 }]);
    const r = splitRow(row(0, 0), false, twoParts, o(), rng(1));
    expect(r.pieces.map((p) => p.region)).toEqual(["outside", "inside", "outside"]);
    expect(r.pieces.every((p) => p.s1 - p.s0 >= 1.5)).toBe(true);
  });

  it("draws a background piece between two mask parts left to right", () => {
    const u = indexMask([{ x: 40, y: 50 }, { x: 160, y: 50 }, { x: 160, y: 150 }, { x: 120, y: 150 }, { x: 120, y: 90 }, { x: 80, y: 90 }, { x: 80, y: 150 }, { x: 40, y: 150 }]);
    const r = splitRow(row(0, 0), false, u, o(), rng(1));
    expect(r.pieces.map((p) => [p.region, p.cutStart, p.cutEnd, p.reversed])).toEqual([
      ["outside", false, true, false], ["inside", true, true, false], ["outside", true, true, false], ["inside", true, true, false], ["outside", true, false, true],
    ]);
  });

  it("runs right-to-left input rows left to right", () => {
    const r = splitRow(row(0, 0).reverse(), false, rect(50, 120), o(), rng(1));
    expect(r.points[0].x).toBe(0);
    expect(cutX(r)).toEqual([50, 120]);
  });
});

describe("Plot Layers: layers, ink budget and priming", () => {
  let g: GeometryCollection;
  beforeAll(async () => { g = await waveRows(); });
  const art = (geo: GeometryCollection) => geo.paths.filter((p) => !p.prime);

  it("splits into 1 object and 2 background, in the chosen order with the chosen names", () => {
    const { geometry, report } = splitPlotLayers(g, request(), SEED, sheetA3);
    expect(geometry!.layers.map((l) => l.name)).toEqual(["object", "background"]);
    expect(report.layers.map((l) => [l.number, l.region])).toEqual([[1, "inside"], [2, "outside"]]);
    const swapped = splitPlotLayers(g, request({ layers: [{ region: "outside", name: "ground" }, { region: "inside", name: "figure" }] }), SEED, sheetA3);
    expect(swapped.report.layers.map((l) => [l.number, l.name, l.region])).toEqual([[1, "ground", "outside"], [2, "figure", "inside"]]);
  });

  it("measures ink per layer as the summed pen-down length of its paths", () => {
    const { geometry, report } = splitPlotLayers(g, request(), SEED, sheetA3);
    for (const l of report.layers) {
      const paths = geometry!.paths.filter((p) => p.layerId === l.id);
      expect(l.inkMm).toBeCloseTo(paths.filter((p) => !p.prime).reduce((a, p) => a + polylineLength(p.points), 0), 6);
      expect(l.primeInkMm).toBeCloseTo(paths.filter((p) => p.prime).reduce((a, p) => a + polylineLength(p.points), 0), 6);
    }
    // Simplification only shortens lines, by very little.
    const total = report.layers.reduce((a, l) => a + l.inkMm, 0), source = g.paths.reduce((a, p) => a + polylineLength(p.points), 0);
    expect(total).toBeLessThanOrEqual(source + 1e-6);
    expect(total).toBeGreaterThan(source * 0.995);
  });

  it("keeps rows top to bottom within each layer and never reorders", () => {
    const { geometry } = splitPlotLayers(g, request(), SEED, sheetA3);
    for (const l of geometry!.layers) {
      const rows = art(geometry!).filter((p) => p.layerId === l.id).map((p) => Number(/r(\d+)p/.exec(p.id)![1]));
      expect(rows).toEqual(rows.slice().sort((a, b) => a - b));
    }
  });

  it("warns when a layer is over one pump's safe budget", () => {
    const { report } = splitPlotLayers(g, request({ inkPerPumpMm: 20_000 }), SEED, sheetA3);
    expect(report.budgetMm).toBeCloseTo(13_000, 6);
    expect(report.layers.every((l) => l.overBudget)).toBe(true);
    expect(report.issues.filter((i) => i.code === "INK_BUDGET")).toHaveLength(2);
  });

  it("auto-splits an over-budget layer at row boundaries only", () => {
    const { geometry, report } = splitPlotLayers(g, request({ inkPerPumpMm: 30_000, autoSplit: true }), SEED, sheetA3);
    expect(report.layers.length).toBeGreaterThan(2);
    expect(report.layers.map((l) => l.number)).toEqual(report.layers.map((_, i) => i + 1));
    expect(report.layers.every((l) => !l.overBudget)).toBe(true);
    const seen = new Map<string, string>();
    for (const p of art(geometry!)) {
      const key = `${/r(\d+)p/.exec(p.id)![1]}:${report.layers.find((l) => l.id === p.layerId)!.region}`;
      if (seen.has(key)) expect(seen.get(key)).toBe(p.layerId); // a row's pieces of one region stay in one part
      seen.set(key, p.layerId);
    }
    expect(report.layers.filter((l) => l.region === "inside").map((l) => l.name)).toEqual(
      report.layers.filter((l) => l.region === "inside").map((_, i, a) => `object ${i + 1} of ${a.length}`));
  });

  it("primes each layer first, in its own spot, on the sheet and clear of the artwork", () => {
    const { geometry, report } = splitPlotLayers(g, request({ inkPerPumpMm: 30_000, autoSplit: true }), SEED, sheetA3);
    expect(report.layers.length).toBe(4);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    const a = geometry!.paths.filter((p) => !p.prime).flatMap((p) => p.points);
    const artBox = { x: Math.min(...a.map((p) => p.x)), y: Math.min(...a.map((p) => p.y)), width: 0, height: 0 };
    artBox.width = Math.max(...a.map((p) => p.x)) - artBox.x; artBox.height = Math.max(...a.map((p) => p.y)) - artBox.y;
    const spots = report.layers.map((l) => l.spot!);
    spots.forEach((s, i) => {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y + s.height).toBeLessThanOrEqual(sheetA3.height);
      expect(overlaps(s, artBox)).toBe(false);
      spots.forEach((t, j) => { if (i !== j) expect(overlaps(s, t)).toBe(false); });
    });
    for (const l of report.layers) {
      const paths = geometry!.paths.filter((p) => p.layerId === l.id), primes = paths.filter((p) => p.prime);
      expect(primes.length).toBe(3 + 10);
      expect(paths.slice(0, primes.length).every((p) => p.prime)).toBe(true); // priming comes first
      for (const p of primes) for (const q of p.points) {
        // Ink (pen width included) stays inside the layer's spot.
        expect(q.x - 0.4).toBeGreaterThanOrEqual(l.spot!.x - 1e-9);
        expect(q.x + 0.4).toBeLessThanOrEqual(l.spot!.x + l.spot!.width + 1e-9);
        expect(q.y - 0.4).toBeGreaterThanOrEqual(l.spot!.y - 1e-9);
        expect(q.y + 0.4).toBeLessThanOrEqual(l.spot!.y + l.spot!.height + 1e-9);
      }
    }
    const dabs = geometry!.paths.filter((p) => p.prime && p.points.length === 2);
    expect(dabs.every((p) => Math.abs(polylineLength(p.points) - 0.3) < 1e-9)).toBe(true);
  });

  it("reports a priming strip that overlaps the artwork, falls off the sheet or is too short", () => {
    const codes = (o: Partial<PlotLayerRequest["prime"]>) =>
      splitPlotLayers(g, request({ prime: { ...DEFAULT_PLOT_LAYERS.prime, auto: false, ...o } }), SEED, sheetA3).report.issues.map((i) => i.code);
    expect(codes({ x: 100, y: 200, width: 100, height: 6 })).toContain("PRIME_OVERLAP");
    expect(codes({ x: 250, y: 410, width: 100, height: 6 })).toContain("PRIME_OFF_SHEET");
    expect(codes({ x: 20, y: 407, width: 30, height: 6 })).toContain("PRIME_FULL");
    expect(primeSpots({ x: 0, y: 0, width: 4, height: 100 }, DEFAULT_PLOT_LAYERS.prime, 2, 0.8)).not.toBeNull(); // vertical strips work too
  });

  it("refuses to split without a mask", () => {
    const { geometry, report } = splitPlotLayers(g, request({ mask: [] }), SEED, sheetA3);
    expect(geometry).toBeNull();
    expect(report.issues.map((i) => i.code)).toEqual(["PLOT_LAYERS_MASK"]);
  });

  it("is deterministic: the same seed and inputs give identical layers; feathering depends on the seed", () => {
    const f = request({ edgeMode: "feathered" });
    const a = splitPlotLayers(g, f, SEED, sheetA3), b = splitPlotLayers(g, f, SEED, sheetA3), c = splitPlotLayers(g, f, SEED + 1, sheetA3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.report.seams)).not.toBe(JSON.stringify(c.report.seams));
  });
});

describe("Plot Layers: settings", () => {
  it("falls back to defaults for missing or broken settings", () => {
    expect(sanitizePlotLayers(undefined)).toEqual(DEFAULT_PLOT_LAYERS);
    expect(sanitizePlotLayers({ flatThresholdMm: "x", snapSearchMm: 1e9, edgeMode: "wobbly", mask: [{ x: 1, y: Number.NaN }, { x: 2, y: 3 }] })).toMatchObject(
      { flatThresholdMm: 0.08, snapSearchMm: 30, edgeMode: "crisp", mask: [{ x: 2, y: 3 }] });
    expect(sanitizePlotLayers({ layers: [{ region: "inside", name: "a" }, { region: "inside", name: "b" }] }).layers).toEqual(DEFAULT_PLOT_LAYERS.layers);
  });

  it("round-trips through a project file (mask, names, order and every parameter); older files load the defaults", () => {
    const { penWidth: _pw, ...plotLayers } = request({ edgeMode: "feathered", seamGapMm: -0.2, inkPerPumpMm: 18_000, autoSplit: true,
      layers: [{ region: "outside", name: "ground" }, { region: "inside", name: "figure" }], prime: { ...DEFAULT_PLOT_LAYERS.prime, auto: false, x: 5, y: 2, width: 90, height: 5, dabs: 4 } });
    const p = makeProject({ projectName: "split", algorithmId: wavePortrait.id, params: { [wavePortrait.id]: defaultParams(wavePortrait) }, seed: SEED, paper: A3,
      profile: DEFAULT_PROFILE, penWidth: 0.8, strokeColor: "#000000", paperColor: "#ffffff", optimize: DEFAULT_OPTIMIZE, clip: DEFAULT_CLIP, plotLayers });
    const r = parseProject(JSON.stringify(p));
    if ("error" in r) throw new Error(r.error);
    expect(r.project.plotLayers).toEqual(plotLayers);
    const { plotLayers: _gone, ...legacy } = p;
    const old = parseProject(JSON.stringify(legacy));
    if ("error" in old) throw new Error(old.error);
    expect(old.project.plotLayers).toEqual(DEFAULT_PLOT_LAYERS);
  });

  it("keeps layer names from changing what AxiDraw does with the layer", () => {
    expect(cleanLayerName("%hidden")).toBe("hidden");
    expect(cleanLayerName("!pause me")).toBe("pause me");
    expect(cleanLayerName("3 face")).toBe("face");
    expect(cleanLayerName("+D5000 body")).toBe("D5000 body");
  });
});
