/**
 * Contour Field — topographic contour lines of a mathematical scalar field, traced with marching squares and
 * joined into continuous paths.
 */
import { blur } from "../core/blur";
import { rng } from "../core/rng";
import { marchingSquares } from "../fields/contours";
import { fbm2 } from "../fields/noise";
import { chaikin } from "../geometry/shape";
import { type Curve, num, sheetOf, str, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, type ParamValues, resolveParams } from "./types";

const usesAttractors = (v: ParamValues) => v.source === "attractors" || v.source === "mixed";

const parameters: ParameterDefinition[] = [
  { id: "source", type: "select", group: "Structure", label: "Field source", default: "mixed",
    options: [
      { value: "mixed", label: "Attractors + noise" }, { value: "attractors", label: "Gaussian attractors" },
      { value: "noise", label: "Noise terrain" }, { value: "radial", label: "Radial" }, { value: "surface", label: "Wave surface" },
    ],
    description: "The mathematical surface whose height lines are drawn." },
  { id: "contourCount", type: "number", group: "Structure", label: "Contour count", default: 42, min: 3, max: 250, step: 1,
    description: "Number of height levels drawn." },
  { id: "thresholdLow", type: "number", group: "Structure", label: "Threshold low", default: 0.02, min: 0, max: 1, step: 0.01,
    description: "Lowest level drawn, as a share of the field's range." },
  { id: "thresholdHigh", type: "number", group: "Structure", label: "Threshold high", default: 0.98, min: 0, max: 1, step: 0.01,
    description: "Highest level drawn, as a share of the field's range." },
  { id: "spacing", type: "number", group: "Density", label: "Contour spacing", default: 1, min: 0.3, max: 3, step: 0.05,
    description: "Spacing curve between levels: 1 = even, below 1 = denser near the low end, above 1 = denser near the high end." },
  { id: "attractorCount", type: "number", group: "Composition", label: "Attractor count", default: 6, min: 1, max: 16, step: 1,
    description: "Number of Gaussian peaks and pits, placed by the seed.", visibleWhen: usesAttractors },
  { id: "attractorSize", type: "number", group: "Composition", label: "Attractor size", default: 40, min: 5, max: 200, step: 1, unit: "mm",
    description: "Typical radius of a peak.", visibleWhen: usesAttractors },
  { id: "pits", type: "boolean", group: "Composition", label: "Allow pits", default: true,
    description: "Let some attractors be depressions instead of peaks.", visibleWhen: usesAttractors },
  { id: "centreX", type: "number", group: "Composition", label: "Centre X", default: 0, min: -300, max: 300, step: 1, unit: "mm",
    description: "Horizontal offset of the radial centre.", visibleWhen: (v) => v.source === "radial" },
  { id: "centreY", type: "number", group: "Composition", label: "Centre Y", default: 0, min: -300, max: 300, step: 1, unit: "mm",
    description: "Vertical offset of the radial centre.", visibleWhen: (v) => v.source === "radial" },
  { id: "surfaceFreq", type: "number", group: "Geometry", label: "Surface frequency", default: 3, min: 0.5, max: 20, step: 0.1,
    description: "Waves across the drawing area.", visibleWhen: (v) => v.source === "surface" },
  { id: "noiseStrength", type: "number", group: "Noise", label: "Noise strength", default: 0.35, min: 0, max: 1, step: 0.01,
    description: "How much noise is mixed into the field.", visibleWhen: (v) => v.source !== "noise" && v.source !== "attractors" },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise scale", default: 70, min: 5, max: 400, step: 1, unit: "mm",
    description: "Size of the largest noise features.", visibleWhen: (v) => v.source !== "attractors" },
  { id: "complexity", type: "number", group: "Noise", label: "Field complexity", default: 3, min: 1, max: 6, step: 1,
    description: "Octaves of noise: more adds finer detail.", visibleWhen: (v) => v.source !== "attractors" },
  { id: "smoothing", type: "number", group: "Advanced", label: "Field smoothing", default: 1, min: 0, max: 10, step: 0.1, unit: "mm",
    description: "Blurs the field before tracing." },
  { id: "curveSmoothing", type: "number", group: "Advanced", label: "Curve smoothing", default: 1, min: 0, max: 3, step: 1,
    description: "Chaikin smoothing passes on each contour." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 400, min: 80, max: 1000, step: 10, unit: "px",
    description: "Grid cells along the long side. Higher follows the field more closely." },
];

export const contourField: GenerativeAlgorithm = {
  id: "contour",
  name: "Contour Field",
  category: "Fields",
  description: "Topographic height lines of attractor, noise, radial or wave surfaces.",
  parameters,
  usesSeed: (v) => v.source === "attractors" || v.source === "noise" || (v.noiseStrength as number) > 0,
  async generate({ params, seed, paper }) {
    const v = resolveParams(contourField, params), sheet = sheetOf(paper), a = sheet.area, source = str(v, "source");
    const cell = Math.max(a.width, a.height) / num(v, "resolution");
    const W = Math.max(4, Math.round(a.width / cell) + 1), H = Math.max(4, Math.round(a.height / cell) + 1);
    const sx = a.width / (W - 1), sy = a.height / (H - 1), field = new Float32Array(W * H);

    // Attractors (seeded positions, sizes, signs)
    const R = rng(seed), atts = Array.from({ length: num(v, "attractorCount") }, () => ({
      x: a.width * (0.1 + 0.8 * R()), y: a.height * (0.1 + 0.8 * R()),
      s: num(v, "attractorSize") * (0.6 + 0.8 * R()), w: v.pits && R() < 0.3 ? -0.7 : 0.6 + 0.4 * R(),
    }));
    const noise = fbm2(seed, num(v, "complexity")), ns = num(v, "noiseScale");
    const nStr = source === "noise" ? 1 : source === "attractors" ? 0 : num(v, "noiseStrength");
    const cx = a.width / 2 + num(v, "centreX"), cy = a.height / 2 + num(v, "centreY"), maxR = Math.hypot(a.width, a.height) / 2;
    const f = (2 * Math.PI * num(v, "surfaceFreq")) / Math.max(a.width, a.height);

    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = i * sx, y = j * sy;
        let h = 0;
        if (source === "attractors" || source === "mixed") for (const t of atts) h += t.w * Math.exp(-((x - t.x) ** 2 + (y - t.y) ** 2) / (2 * t.s * t.s));
        else if (source === "radial") h = 1 - Math.hypot(x - cx, y - cy) / maxR;
        else if (source === "surface") h = Math.sin(x * f) * Math.cos(y * f * 0.8) + 0.5 * Math.sin((x + y) * f * 0.5);
        field[j * W + i] = nStr ? h + nStr * noise(x / ns, y / ns) * (source === "noise" ? 1 : 0.6) : h;
      }
    }
    const data = blur(field, W, H, num(v, "smoothing") / cell);
    let lo = Infinity, hi = -Infinity;
    for (const x of data) { if (x < lo) lo = x; if (x > hi) hi = x; }
    let t0 = num(v, "thresholdLow"), t1 = num(v, "thresholdHigh");
    if (t0 > t1) [t0, t1] = [t1, t0];
    const n = num(v, "contourCount"), g = num(v, "spacing"), curves: Curve[] = [], iters = num(v, "curveSmoothing");
    for (let k = 0; k < n; k++) {
      const level = lo + (hi - lo) * (t0 + (t1 - t0) * ((k + 0.5) / n) ** g);
      for (const c of marchingSquares(data, W, H, level)) {
        const pts = c.points.map((p) => ({ x: a.x + p.x * sx, y: a.y + p.y * sy }));
        curves.push({ points: chaikin(pts, c.closed, iters), closed: c.closed });
      }
    }
    return toCollection(sheet, curves);
  },
};
