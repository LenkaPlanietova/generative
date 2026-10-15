/**
 * Flow Field — evenly spaced streamlines (Jobard–Lefer, variable separation) through a seeded noise field.
 * Lines follow the contours of a smooth noise "terrain"; spacing follows a density field (constant or radial).
 * Every parameter is in mm or degrees. Grid resolution only changes precision, not the drawing.
 */
import type { Grid } from "../core/fields";
import { gridToMm } from "../core/path";
import { sheetFor } from "../core/paper";
import { constantScalar } from "../fields/constant";
import { noiseHeight } from "../fields/noise";
import { radialGradient } from "../fields/radial";
import { directionFromHeight } from "../fields/structureTensor";
import { type SeedOrder, traceStreamlines } from "../engine/streamlines";
import { fromFlat } from "../geometry/convert";
import { DEFAULT_LAYER, type GeometryCollection } from "../geometry/types";
import { type GenerativeAlgorithm, type ParameterDefinition, type ParamValues, resolveParams } from "./types";

const radial = (v: ParamValues) => v.density === "radial";

const parameters: ParameterDefinition[] = [
  // Structure
  { id: "seedOrder", type: "select", group: "Structure", label: "Seed distribution", default: "dark",
    options: [{ value: "dark", label: "Densest first" }, { value: "center", label: "Centre outwards" }, { value: "random", label: "Random" }],
    description: "Where new lines start when no neighbour can seed one. Changes which lines win where they meet." },
  { id: "maxLines", type: "number", group: "Structure", label: "Line count limit", default: 4000, min: 10, max: 20000, step: 10,
    description: "Safety limit: tracing stops after this many lines." },
  { id: "minLength", type: "number", group: "Structure", label: "Min line length", default: 4, min: 0, max: 50, step: 0.5, unit: "mm",
    description: "Lines shorter than this are discarded." },
  { id: "maxLength", type: "number", group: "Structure", label: "Max line length", default: 600, min: 10, max: 3000, step: 10, unit: "mm",
    description: "Lines stop growing at this length." },
  // Geometry
  { id: "stepSize", type: "number", group: "Geometry", label: "Step size", default: 0.35, min: 0.1, max: 1, step: 0.05, unit: "×",
    description: "Integration step as a multiple of the minimum spacing. Smaller is smoother and slower." },
  { id: "maxTurn", type: "number", group: "Geometry", label: "Max turn per step", default: 35, min: 5, max: 90, step: 1, unit: "°",
    description: "Curvature limit. Lines stop at sharper kinks, such as the centre of a swirl." },
  // Distortion
  { id: "offset", type: "number", group: "Distortion", label: "Flow direction", default: 0, min: -90, max: 90, step: 1, unit: "°",
    description: "0° = lines follow the terrain contours, 90° = lines run down the slopes." },
  { id: "wobble", type: "number", group: "Distortion", label: "Wobble amount", default: 0, min: 0, max: 90, step: 1, unit: "°",
    description: "Random rotation added to the flow (randomness)." },
  { id: "wobbleSize", type: "number", group: "Distortion", label: "Wobble size", default: 20, min: 2, max: 200, step: 1, unit: "mm",
    description: "Feature size of the wobble.", visibleWhen: (v) => (v.wobble as number) > 0 },
  // Noise
  { id: "noiseSize", type: "number", group: "Noise", label: "Noise scale", default: 60, min: 5, max: 400, step: 1, unit: "mm",
    description: "Size of the largest hills and valleys in the noise terrain." },
  { id: "noiseOctaves", type: "number", group: "Noise", label: "Noise detail", default: 2, min: 1, max: 5, step: 1,
    description: "Octaves of noise. More adds smaller features." },
  { id: "detail", type: "number", group: "Noise", label: "Detail smoothing", default: 2, min: 0.2, max: 20, step: 0.1, unit: "mm",
    description: "Lower reacts to small features, higher gives calmer curves." },
  { id: "swirlSize", type: "number", group: "Noise", label: "Swirl size", default: 15, min: 1, max: 120, step: 1, unit: "mm",
    description: "Scale of the overall-form field blended with the detail field." },
  { id: "swirlStrength", type: "number", group: "Noise", label: "Swirl strength", default: 0.6, min: 0, max: 4, step: 0.05,
    description: "How much the overall form steers the lines compared with detail." },
  // Density
  { id: "darkestSpacing", type: "number", group: "Density", label: "Min spacing", default: 0.6, min: 0.2, max: 5, step: 0.05, unit: "mm", role: "minSpacing",
    description: "Line spacing in the densest areas. Keep it above 1.2 × pen width." },
  { id: "lightestSpacing", type: "number", group: "Density", label: "Max spacing", default: 3, min: 0.5, max: 15, step: 0.1, unit: "mm",
    description: "Line spacing in the lightest areas." },
  { id: "gamma", type: "number", group: "Density", label: "Gamma", default: 1, min: 0.2, max: 3, step: 0.05,
    description: "Spacing curve. Below 1 pushes more lines into the mid-tones." },
  { id: "clearance", type: "number", group: "Density", label: "Clearance", default: 0.5, min: 0.2, max: 1, step: 0.01, unit: "×",
    description: "Path repulsion: a line stops when it gets closer than this × the local spacing to another line." },
  { id: "whiteCut", type: "number", group: "Density", label: "White cut", default: 1, min: 0.5, max: 1, step: 0.005,
    description: "No lines where the density field is lighter than this. 1 = lines everywhere." },
  { id: "density", type: "select", group: "Density", label: "Density field", default: "radial",
    options: [{ value: "radial", label: "Radial gradient" }, { value: "constant", label: "Constant" }],
    description: "Where lines are dense (dark) and sparse (light)." },
  { id: "constantTone", type: "number", group: "Density", label: "Tone", default: 0.5, min: 0, max: 1, step: 0.01,
    description: "0 = min spacing everywhere, 1 = max spacing.", visibleWhen: (v) => v.density === "constant" },
  { id: "centreTone", type: "number", group: "Density", label: "Centre tone", default: 0, min: 0, max: 1, step: 0.01,
    description: "Tone at the centre of the gradient (0 = densest).", visibleWhen: radial },
  { id: "edgeTone", type: "number", group: "Density", label: "Edge tone", default: 1, min: 0, max: 1, step: 0.01,
    description: "Tone at and beyond the radius.", visibleWhen: radial },
  // Composition
  { id: "radius", type: "number", group: "Composition", label: "Gradient radius", default: 110, min: 5, max: 600, step: 1, unit: "mm",
    description: "Radius of the density gradient.", visibleWhen: radial },
  { id: "centreX", type: "number", group: "Composition", label: "Centre X", default: 0, min: -300, max: 300, step: 1, unit: "mm",
    description: "Horizontal offset of the gradient centre from the middle of the drawing area.", visibleWhen: radial },
  { id: "centreY", type: "number", group: "Composition", label: "Centre Y", default: 0, min: -300, max: 300, step: 1, unit: "mm",
    description: "Vertical offset of the gradient centre from the middle of the drawing area.", visibleWhen: radial },
  // Advanced
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 800, min: 200, max: 1600, step: 50, unit: "px",
    description: "Calculation grid along the long side. Changes precision and speed, not the drawing." },
];

export const flowField: GenerativeAlgorithm = {
  id: "flow-field",
  name: "Flow Field",
  category: "Flow",
  description: "Evenly spaced streamlines that follow the contours of a seeded noise terrain.",
  parameters,
  async generate({ params, seed, paper, onProgress, signal }): Promise<GeometryCollection> {
    const p = resolveParams(flowField, params) as Record<string, number> & Record<"seedOrder" | "density", string>;
    const sheet = sheetFor(paper), a = sheet.area;
    const mmPerPx = Math.max(a.width, a.height) / p.resolution;
    const grid: Grid = { width: Math.max(8, Math.round(a.width / mmPerPx)), height: Math.max(8, Math.round(a.height / mmPerPx)), mmPerPx };

    const height = noiseHeight(grid, { size: p.noiseSize, octaves: p.noiseOctaves, seed });
    const direction = directionFromHeight(height, grid, {
      detail: p.detail, swirlSize: p.swirlSize, swirlStrength: p.swirlStrength, offset: p.offset,
      wobble: p.wobble, wobbleSize: p.wobbleSize, seed,
    });
    const tone = p.density === "radial"
      ? radialGradient(grid, { centreTone: p.centreTone, edgeTone: p.edgeTone, radius: p.radius, cx: a.width / 2 + p.centreX, cy: a.height / 2 + p.centreY })
      : constantScalar(grid, p.constantTone);

    let batchNo = 0;
    const { lines } = traceStreamlines({
      direction, tone, mmPerPx,
      params: {
        darkestSpacing: p.darkestSpacing, lightestSpacing: p.lightestSpacing, gamma: p.gamma, clearance: p.clearance,
        minLength: p.minLength, maxLength: p.maxLength, maxTurn: p.maxTurn, stepSize: p.stepSize,
        seedOrder: p.seedOrder as SeedOrder, whiteCut: p.whiteCut, seed,
      },
      maxLines: p.maxLines,
      shouldStop: signal && (() => signal.aborted),
      onBatch: onProgress && ((b, f) => onProgress(f, fromFlat(gridToMm(b, mmPerPx, a.x, a.y), DEFAULT_LAYER.id, `b${batchNo++}-`))),
    });
    return { widthMm: sheet.width, heightMm: sheet.height, layers: [DEFAULT_LAYER], paths: fromFlat(gridToMm(lines, mmPerPx, a.x, a.y), DEFAULT_LAYER.id) };
  },
};
