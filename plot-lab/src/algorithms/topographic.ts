/**
 * Topographic Fields — a contour map of an advanced-noise terrain. Every Nth contour is an index contour on its
 * own layer, so it can be plotted with a heavier pen, as on survey maps.
 */
import { blur } from "../core/blur";
import { NOISE_TYPE_OPTIONS, type NoiseType, noiseSampler } from "../fields/noise";
import { gridOver, num, sheetOf, str, toLayeredCollection, traceLevels } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "noiseType", type: "select", group: "Noise", label: "Terrain type", default: "ridged", options: NOISE_TYPE_OPTIONS,
    description: "Ridged gives mountain crests, billowed rolling hills, warped eroded swirls." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Terrain scale", default: 180, min: 10, max: 800, step: 1, unit: "mm", description: "Size of the largest landforms." },
  { id: "octaves", type: "number", group: "Noise", label: "Terrain detail", default: 4, min: 1, max: 8, step: 1, description: "Octaves of noise: more adds smaller valleys and spurs." },
  { id: "warp", type: "number", group: "Noise", label: "Domain warp", default: 0.8, min: 0.1, max: 4, step: 0.05,
    description: "Swirl of the terrain.", visibleWhen: (v) => v.noiseType === "warped" },
  { id: "contourCount", type: "number", group: "Structure", label: "Contour count", default: 35, min: 3, max: 250, step: 1, description: "Height levels above sea level." },
  { id: "indexEvery", type: "number", group: "Structure", label: "Index contour every", default: 5, min: 0, max: 20, step: 1,
    description: "Every Nth contour goes on the separate “index” layer for a heavier pen. 0 = none." },
  { id: "seaLevel", type: "number", group: "Composition", label: "Sea level", default: 0.2, min: 0, max: 0.95, step: 0.01,
    description: "Share of the height range under water — no contours there; the coastline is drawn on the index layer." },
  { id: "relief", type: "number", group: "Density", label: "Relief", default: 1.3, min: 0.3, max: 3, step: 0.05,
    description: "Spacing curve: above 1 packs contours near the peaks, below 1 near the coast." },
  { id: "smoothing", type: "number", group: "Advanced", label: "Field smoothing", default: 1.5, min: 0, max: 10, step: 0.1, unit: "mm", description: "Blurs the terrain before tracing." },
  { id: "curveSmoothing", type: "number", group: "Advanced", label: "Curve smoothing", default: 1, min: 0, max: 3, step: 1, description: "Chaikin smoothing passes." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 420, min: 80, max: 1000, step: 10, unit: "px", description: "Grid cells along the long side." },
];

export const topographic: GenerativeAlgorithm = {
  id: "topographic",
  name: "Topographic Fields",
  category: "Fields",
  description: "Survey-style contour maps of ridged, billowed or warped terrain, with index contours on their own layer.",
  parameters,
  async generate({ params, seed, paper }) {
    const v = resolveParams(topographic, params), sheet = sheetOf(paper), a = sheet.area;
    const { W, H, sx, sy } = gridOver(a, num(v, "resolution")), ns = num(v, "noiseScale");
    const f = noiseSampler(str(v, "noiseType") as NoiseType, seed, num(v, "octaves"), num(v, "warp")), data = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data[j * W + i] = f((i * sx) / ns, (j * sy) / ns);
    const field = blur(data, W, H, num(v, "smoothing") / Math.max(sx, sy));
    let lo = Infinity, hi = -Infinity;
    for (const x of field) { if (x < lo) lo = x; if (x > hi) hi = x; }
    const sea = lo + (hi - lo) * num(v, "seaLevel"), n = num(v, "contourCount"), every = num(v, "indexEvery"), g = num(v, "relief");
    // Level 0 is the coastline; levels climb to just under the highest peak.
    const levels = Array.from({ length: n }, (_, k) => sea + (hi - sea) * (k / n) ** g);
    const traced = traceLevels(field, W, H, levels, a, num(v, "curveSmoothing"));
    const isIndex = (k: number) => k === 0 || (every > 0 && k % every === 0);
    return toLayeredCollection(sheet, [
      { id: "contours", name: "contours", curves: traced.filter((_, k) => !isIndex(k)).flat() },
      { id: "index", name: "index contours", curves: traced.filter((_, k) => isIndex(k)).flat() },
    ]);
  },
};
