/**
 * Noise Flow — the classic noise-angle flow field (direction = noise × turbulence), drawn with the evenly spaced
 * streamline engine so lines never cross or clump.
 */
import type { DirectionField, Grid } from "../core/fields";
import { gridToMm } from "../core/path";
import { constantScalar } from "../fields/constant";
import { NOISE_TYPE_OPTIONS, type NoiseType, noiseSampler } from "../fields/noise";
import { type SeedOrder, traceStreamlines } from "../engine/streamlines";
import { fromFlat } from "../geometry/convert";
import { DEFAULT_LAYER } from "../geometry/types";
import { num, sheetOf, str } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "noiseType", type: "select", group: "Noise", label: "Noise type", default: "warped", options: NOISE_TYPE_OPTIONS, description: "Character of the noise steering the lines." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise scale", default: 110, min: 5, max: 600, step: 1, unit: "mm", description: "Size of the largest swirls." },
  { id: "octaves", type: "number", group: "Noise", label: "Noise detail", default: 2, min: 1, max: 6, step: 1, description: "Octaves of noise." },
  { id: "warp", type: "number", group: "Noise", label: "Domain warp", default: 1.2, min: 0.1, max: 4, step: 0.05,
    description: "How strongly the noise is swirled.", visibleWhen: (v) => v.noiseType === "warped" },
  { id: "turbulence", type: "number", group: "Distortion", label: "Turbulence", default: 1.4, min: 0.05, max: 6, step: 0.05,
    description: "Noise → angle multiplier. Low = gentle drift, high = tight curls." },
  { id: "flowAngle", type: "number", group: "Distortion", label: "Flow direction", default: 0, min: 0, max: 179, step: 1, unit: "°", description: "Overall direction of the flow." },
  { id: "lineSpacing", type: "number", group: "Density", label: "Line spacing", default: 1.5, min: 0.3, max: 10, step: 0.05, unit: "mm", role: "minSpacing",
    description: "Distance between neighbouring lines." },
  { id: "clearance", type: "number", group: "Density", label: "Clearance", default: 0.6, min: 0.2, max: 1, step: 0.01, unit: "×",
    description: "A line stops when it gets closer than this × spacing to another." },
  { id: "seedOrder", type: "select", group: "Structure", label: "Seed distribution", default: "random",
    options: [{ value: "random", label: "Random" }, { value: "center", label: "Centre outwards" }, { value: "dark", label: "Grid order" }],
    description: "Order in which lines are started." },
  { id: "minLength", type: "number", group: "Structure", label: "Min line length", default: 6, min: 0, max: 100, step: 0.5, unit: "mm", description: "Shorter lines are discarded." },
  { id: "maxLength", type: "number", group: "Structure", label: "Max line length", default: 500, min: 10, max: 20000, step: 10, unit: "mm", description: "Lines stop growing at this length." },
  { id: "maxLines", type: "number", group: "Structure", label: "Line count limit", default: 4000, min: 10, max: 20000, step: 10, description: "Safety limit on the number of lines." },
  { id: "maxTurn", type: "number", group: "Geometry", label: "Max turn per step", default: 30, min: 5, max: 90, step: 1, unit: "°", description: "Lines stop at sharper kinks." },
  { id: "stepSize", type: "number", group: "Geometry", label: "Step size", default: 0.35, min: 0.1, max: 1, step: 0.05, unit: "×", description: "Integration step as a multiple of the spacing." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 600, min: 150, max: 1600, step: 50, unit: "px", description: "Calculation grid along the long side." },
];

export const noiseFlow: GenerativeAlgorithm = {
  id: "noise-flow",
  name: "Noise Flow",
  category: "Flow",
  description: "Lines swept along a noise-angle field: drifting currents, curls and marbling.",
  parameters,
  async generate({ params, seed, paper, onProgress, signal }) {
    const v = resolveParams(noiseFlow, params), sheet = sheetOf(paper), a = sheet.area;
    const mmPerPx = Math.max(a.width, a.height) / num(v, "resolution");
    const grid: Grid = { width: Math.max(8, Math.round(a.width / mmPerPx)), height: Math.max(8, Math.round(a.height / mmPerPx)), mmPerPx };
    const f = noiseSampler(str(v, "noiseType") as NoiseType, seed, num(v, "octaves"), num(v, "warp"));
    const k = mmPerPx / num(v, "noiseScale"), base = (num(v, "flowAngle") * Math.PI) / 180, turb = num(v, "turbulence") * Math.PI;
    const n = grid.width * grid.height, c = new Float32Array(n), s = new Float32Array(n);
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      const th = base + f(x * k, y * k) * turb, i = y * grid.width + x;
      c[i] = Math.cos(2 * th); s[i] = Math.sin(2 * th); // double-angle form
    }
    const direction: DirectionField = { width: grid.width, height: grid.height, c, s }, sp = num(v, "lineSpacing");
    const { lines } = traceStreamlines({
      direction, tone: constantScalar(grid, 0), mmPerPx,
      params: {
        darkestSpacing: sp, lightestSpacing: sp, gamma: 1, clearance: num(v, "clearance"), minLength: num(v, "minLength"), maxLength: num(v, "maxLength"),
        maxTurn: num(v, "maxTurn"), stepSize: num(v, "stepSize"), seedOrder: str(v, "seedOrder") as SeedOrder, whiteCut: 1, seed,
      },
      maxLines: num(v, "maxLines"),
      shouldStop: signal && (() => signal.aborted),
      onBatch: onProgress && ((b, p) => onProgress(p, fromFlat(gridToMm(b, mmPerPx, a.x, a.y), DEFAULT_LAYER.id, "b"))),
    });
    return { widthMm: sheet.width, heightMm: sheet.height, layers: [DEFAULT_LAYER], paths: fromFlat(gridToMm(lines, mmPerPx, a.x, a.y), DEFAULT_LAYER.id) };
  },
};
