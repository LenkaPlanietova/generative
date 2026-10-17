/**
 * Flow Hatching — Adaptive Hatching's tone bands drawn with Redraw's flowing lines. Each darker tone band adds a
 * layer of evenly spaced streamlines that follow the image's forms, turned by a further angle per layer
 * ("Layers cross at"), so tone builds up as in cross-hatching but every stroke curves with the face. Each layer is a pen layer.
 */
import type { DirectionField } from "../core/fields";
import { gridToMm } from "../core/path";
import { traceStreamlines } from "../engine/streamlines";
import { fromFlat } from "../geometry/convert";
import type { GeometryCollection, PlotPath } from "../geometry/types";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { num, sheetOf } from "./common";
import { imageFlowFields } from "./imageFlow";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

/** Per-layer turn from the form direction, for each crossing style. */
const CROSSINGS: Record<string, number[]> = {
  cross: [0, 90, 45, -45],
  diagonal: [0, 45, -45, 90],
  gentle: [0, 25, -25, 50],
};

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  { id: "layers", type: "number", group: "Structure", label: "Hatch layers", default: 3, min: 1, max: 4, step: 1,
    description: "Each darker tone band adds a layer of lines, crossing the first at the angle set below." },
  { id: "crossing", type: "select", group: "Structure", label: "Layers cross at", default: "gentle",
    options: [{ value: "cross", label: "Right angles (90°, then 45°)" }, { value: "diagonal", label: "Diagonals (45°)" }, { value: "gentle", label: "Shallow angles (25°)" }],
    description: "How sharply each darker layer crosses the first. Shallow angles read as a soft weave rather than a mesh.", visibleWhen: (v) => (v.layers as number) >= 2 },
  { id: "offset", type: "number", group: "Structure", label: "Direction offset", default: 0, min: -90, max: 90, step: 1, unit: "°",
    description: "Turns every layer: 0° = the first layer runs along the forms, 90° = across them." },
  { id: "spacing", type: "number", group: "Density", label: "Line spacing", default: 0.9, min: 0.3, max: 10, step: 0.05, unit: "mm", role: "minSpacing",
    description: "Gap between lines in the darkest part of each layer. Keep it above 1.2 × pen width." },
  { id: "spacingVariation", type: "number", group: "Density", label: "Spacing variation", default: 0.8, min: 0, max: 4, step: 0.05, unit: "×",
    description: "How much wider the gaps get towards a layer's lightest tone (0 = even spacing, 1 = twice as wide)." },
  { id: "threshold1", type: "number", group: "Density", label: "Layer 1 below tone", default: 0.82, min: 0, max: 1, step: 0.01, description: "Layer 1 draws where the image is darker than this." },
  { id: "threshold2", type: "number", group: "Density", label: "Layer 2 below tone", default: 0.58, min: 0, max: 1, step: 0.01,
    description: "Layer 2 adds its lines where darker than this.", visibleWhen: (v) => (v.layers as number) >= 2 },
  { id: "threshold3", type: "number", group: "Density", label: "Layer 3 below tone", default: 0.36, min: 0, max: 1, step: 0.01,
    description: "Layer 3 adds its lines where darker than this.", visibleWhen: (v) => (v.layers as number) >= 3 },
  { id: "threshold4", type: "number", group: "Density", label: "Layer 4 below tone", default: 0.18, min: 0, max: 1, step: 0.01,
    description: "Layer 4 adds its lines where darker than this.", visibleWhen: (v) => (v.layers as number) >= 4 },
  { id: "minLength", type: "number", group: "Structure", label: "Min line length", default: 2, min: 0, max: 50, step: 0.5, unit: "mm", description: "Shorter lines are dropped." },
  { id: "detail", type: "number", group: "Noise", label: "Detail smoothing", default: 1.2, min: 0.1, max: 10, step: 0.01, unit: "mm",
    description: "Scale of the local direction field: lower follows small features (eyelids, lips) more closely." },
  { id: "swirlSize", type: "number", group: "Noise", label: "Form size", default: 6, min: 0.2, max: 40, step: 0.1, unit: "mm",
    description: "Scale of the overall-form direction field." },
  { id: "swirlStrength", type: "number", group: "Noise", label: "Form strength", default: 1, min: 0, max: 4, step: 0.05,
    description: "How much the overall form steers the lines compared with detail. Higher = calmer, longer sweeps." },
  { id: "clearance", type: "number", group: "Advanced", label: "Clearance", default: 0.6, min: 0.2, max: 1, step: 0.01, unit: "×",
    description: "How close a line may run to a neighbour before it stops (× spacing)." },
  { id: "maxTurn", type: "number", group: "Advanced", label: "Max turn per step", default: 40, min: 5, max: 90, step: 1, unit: "°", description: "Lines stop at sharper kinks." },
  { id: "toneBlur", type: "number", group: "Advanced", label: "Tone smoothing", default: 0.6, min: 0, max: 10, step: 0.05, unit: "mm", description: "Softens the tone bands' edges." },
  { id: "preBlur", type: "number", group: "Advanced", label: "Gradient pre-blur", default: 0.3, min: 0, max: 5, step: 0.01, unit: "mm", description: "Blur before measuring the image's gradients." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 1400, min: 300, max: 3200, step: 50, unit: "px",
    description: "Calculation grid along the long side. Higher follows fine detail; uses more memory." },
];

/** The direction field turned by `deg` (double-angle form, so the rotation is 2·deg). */
function rotated(d: DirectionField, deg: number): DirectionField {
  if (deg === 0) return d;
  const r = (deg * Math.PI) / 90, co = Math.cos(r), si = Math.sin(r), c = new Float32Array(d.c.length), s = new Float32Array(d.s.length);
  for (let i = 0; i < c.length; i++) { c[i] = d.c[i] * co - d.s[i] * si; s[i] = d.c[i] * si + d.s[i] * co; }
  return { ...d, c, s };
}

export const flowHatching: GenerativeAlgorithm = {
  id: "flow-hatching",
  name: "Flow Hatching",
  category: "Image-driven",
  description: "Tone built up in layers like cross-hatching, but every line flows along the forms of the image.",
  parameters,
  inputs: { photo: true },
  async generate({ params, seed, paper, images, onProgress, signal }) {
    const v = resolveParams(flowHatching, params), sheet = sheetOf(paper), a = sheet.area;
    const { grid, direction, luma } = imageFlowFields(sheet, {
      photo: images?.photo ?? sampleImages().photo, relief: 0, adjust: adjustFrom(v), resolution: num(v, "resolution"),
      preBlur: num(v, "preBlur"), detail: num(v, "detail"), swirlSize: num(v, "swirlSize"), swirlStrength: num(v, "swirlStrength"),
      toneBlur: num(v, "toneBlur"), whitePoint: 1, detailBoost: 0, edgeSensitivity: 0,
      offset: num(v, "offset"), wobble: 0, wobbleSize: 1, flatFallback: true,
    }, seed);
    const n = luma.data.length, count = num(v, "layers"), spacing = num(v, "spacing");
    const out: GeometryCollection = { widthMm: sheet.width, heightMm: sheet.height, layers: [], paths: [] };
    for (let k = 0; k < count; k++) {
      if (signal?.aborted) break;
      // Tone within this layer's band: 0 at black, 1 at its threshold and above (no lines past the white cut).
      const limit = Math.max(1e-3, num(v, `threshold${k + 1}`)), tone = new Float32Array(n);
      for (let i = 0; i < n; i++) tone[i] = Math.min(1, luma.data[i] / limit);
      const id = `flow${k + 1}`, angle = (CROSSINGS[v.crossing as string] ?? CROSSINGS.gentle)[k];
      const { lines } = traceStreamlines({
        direction: rotated(direction, angle), tone: { width: luma.width, height: luma.height, data: tone }, mmPerPx: grid.mmPerPx,
        params: {
          darkestSpacing: spacing, lightestSpacing: spacing * (1 + num(v, "spacingVariation")), gamma: 1, clearance: num(v, "clearance"),
          whiteCut: 0.999, minLength: num(v, "minLength"), maxLength: 2000, maxTurn: num(v, "maxTurn"), stepSize: 0.35,
          seedOrder: "dark", seed: seed + k, seedClearance: 1, selfCollision: "half",
        },
        maxLines: 20000,
        shouldStop: signal && (() => signal.aborted),
        onBatch: onProgress && ((b, p) => onProgress((k + p) / count, fromFlat(gridToMm(b, grid.mmPerPx, a.x, a.y), id, "b"))),
      });
      const paths: PlotPath[] = fromFlat(gridToMm(lines, grid.mmPerPx, a.x, a.y), id, `l${k + 1}-`);
      out.layers.push({ id, name: `flow ${k + 1}${angle ? ` (${angle > 0 ? "+" : ""}${angle}°)` : ""}`, stroke: "#000000" });
      out.paths.push(...paths);
    }
    return out;
  },
};
