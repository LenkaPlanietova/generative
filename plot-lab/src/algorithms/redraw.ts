/**
 * Redraw — new flow lines generated from a reference image (SPEC_ADDENDUM §D.1). Direction comes from the
 * structure tensor of the image, so the new lines follow the original's strokes; spacing comes from its tone.
 * Nothing is traced: every line is new geometry. Defaults are the "redraw dense" settings from reference/README.md
 * (source-pixel sizes converted to mm for that image on A3).
 */
import type { SeedOrder } from "../engine/streamlines";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { num, sheetOf } from "./common";
import { imageFlowFields, traceImageFlow } from "./imageFlow";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

export const STREAM_PARAMS = (d: { dark: number; light: number; gamma: number; white: number; clearance: number; minLen: number; turn: number; seedClear: number; selfAvoid: "line" | "half" }): ParameterDefinition[] => [
  { id: "darkestSpacing", type: "number", group: "Density", label: "Darkest spacing", default: d.dark, min: 0.15, max: 5, step: 0.01, unit: "mm", role: "minSpacing",
    description: "Gap between lines in the darkest areas. Keep it above 1.2 × pen width, or those areas plot solid black." },
  { id: "lightestSpacing", type: "number", group: "Density", label: "Lightest spacing", default: d.light, min: 0.3, max: 15, step: 0.05, unit: "mm",
    description: "Gap between lines in the lightest areas." },
  { id: "gamma", type: "number", group: "Density", label: "Gamma", default: d.gamma, min: 0.2, max: 3, step: 0.05,
    description: "Below 1 pushes more lines into the mid-tones." },
  { id: "whiteCut", type: "number", group: "Density", label: "White cut", default: d.white, min: 0.5, max: 1, step: 0.005,
    description: "No lines where the tone is lighter than this — leaves the highlights as open paper." },
  { id: "clearance", type: "number", group: "Density", label: "Clearance", default: d.clearance, min: 0.2, max: 1, step: 0.01, unit: "×",
    description: "How close a line may run to a neighbour before it stops (× spacing)." },
  { id: "seedClearance", type: "number", group: "Density", label: "Seed clearance", default: d.seedClear, min: 0.3, max: 1.5, step: 0.01, unit: "×",
    description: "Free space a new line needs around its starting point (× spacing). Higher = fewer, longer lines." },
  { id: "selfCollision", type: "select", group: "Advanced", label: "Self-avoidance", default: d.selfAvoid,
    options: [{ value: "half", label: "Each half (longer lines)" }, { value: "line", label: "Whole line" }],
    description: "Whether a line's backward half must also keep clear of its forward half. Each half: longer, looping lines (as in the Python reference)." },
  { id: "minLength", type: "number", group: "Structure", label: "Min line length", default: d.minLen, min: 0, max: 50, step: 0.5, unit: "mm", description: "Shorter lines are dropped." },
  { id: "maxLength", type: "number", group: "Structure", label: "Max line length", default: 2000, min: 10, max: 20000, step: 10, unit: "mm", description: "Lines stop growing at this length." },
  { id: "maxLines", type: "number", group: "Structure", label: "Line count limit", default: 20000, min: 10, max: 50000, step: 10, description: "Safety limit on the number of lines." },
  { id: "seedOrder", type: "select", group: "Structure", label: "Seed distribution", default: "dark",
    options: [{ value: "dark", label: "Darkest first" }, { value: "center", label: "Centre outwards" }, { value: "random", label: "Random" }],
    description: "Where new lines start when no neighbour can seed one." },
  { id: "maxTurn", type: "number", group: "Geometry", label: "Max turn per step", default: d.turn, min: 5, max: 90, step: 1, unit: "°",
    description: "Lines stop at sharper kinks (swirl centres)." },
  { id: "stepSize", type: "number", group: "Geometry", label: "Step size", default: 0.35, min: 0.1, max: 1, step: 0.05, unit: "×", description: "Integration step as a multiple of the darkest spacing." },
];

export const traceOptions = (v: Record<string, unknown>) => ({
  darkestSpacing: v.darkestSpacing as number, lightestSpacing: v.lightestSpacing as number, gamma: v.gamma as number, clearance: v.clearance as number,
  whiteCut: v.whiteCut as number, minLength: v.minLength as number, maxLength: v.maxLength as number, maxTurn: v.maxTurn as number,
  stepSize: v.stepSize as number, seedOrder: v.seedOrder as SeedOrder, maxLines: v.maxLines as number, seedClearance: v.seedClearance as number,
  selfCollision: v.selfCollision as "line" | "half",
});

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  ...STREAM_PARAMS({ dark: 0.35, light: 1.3, gamma: 0.5, white: 0.985, clearance: 0.55, minLen: 3, turn: 40, seedClear: 1, selfAvoid: "half" }),
  { id: "detail", type: "number", group: "Noise", label: "Detail smoothing", default: 0.68, min: 0.1, max: 10, step: 0.01, unit: "mm",
    description: "Scale of the local direction field: lower follows small strokes (eyelids, lips) more closely." },
  { id: "swirlSize", type: "number", group: "Noise", label: "Swirl size", default: 2.72, min: 0.2, max: 40, step: 0.01, unit: "mm",
    description: "Scale of the overall-form direction field." },
  { id: "swirlStrength", type: "number", group: "Noise", label: "Swirl strength", default: 0.5, min: 0, max: 4, step: 0.05,
    description: "How much the overall form steers the lines compared with detail." },
  { id: "offset", type: "number", group: "Distortion", label: "Direction offset", default: 0, min: -90, max: 90, step: 1, unit: "°",
    description: "0° = lines run along the source strokes, 90° = across them." },
  { id: "wobble", type: "number", group: "Distortion", label: "Wobble amount", default: 0, min: 0, max: 90, step: 1, unit: "°", description: "Seeded random rotation of the flow." },
  { id: "wobbleSize", type: "number", group: "Distortion", label: "Wobble size", default: 15, min: 1, max: 200, step: 1, unit: "mm",
    description: "Feature size of the wobble.", visibleWhen: (v) => (v.wobble as number) > 0 },
  { id: "toneBlur", type: "number", group: "Advanced", label: "Tone smoothing", default: 0.57, min: 0, max: 10, step: 0.01, unit: "mm", description: "Blur of the brightness used for spacing." },
  { id: "preBlur", type: "number", group: "Advanced", label: "Gradient pre-blur", default: 0.18, min: 0, max: 5, step: 0.01, unit: "mm", description: "Blur before measuring the image's gradients." },
  { id: "whitePoint", type: "number", group: "Advanced", label: "Blank above", default: 0.985, min: 0.5, max: 1, step: 0.005, description: "Areas brighter than this get no lines (after Levels). To clear bright skin, lower Levels: white instead." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 1800, min: 300, max: 3200, step: 50, unit: "px",
    description: "Calculation grid along the long side. Higher follows fine detail; uses more memory." },
];

export const redraw: GenerativeAlgorithm = {
  id: "redraw",
  name: "Redraw",
  category: "Image-driven",
  description: "New evenly spaced lines that follow the strokes and tones of a reference drawing or photo.",
  parameters,
  inputs: { photo: true },
  async generate({ params, seed, paper, images, onProgress, signal }) {
    const v = resolveParams(redraw, params), sheet = sheetOf(paper);
    const fields = imageFlowFields(sheet, {
      photo: images?.photo ?? sampleImages().photo, relief: 0, adjust: adjustFrom(v), resolution: num(v, "resolution"),
      preBlur: num(v, "preBlur"), detail: num(v, "detail"), swirlSize: num(v, "swirlSize"), swirlStrength: num(v, "swirlStrength"),
      toneBlur: num(v, "toneBlur"), whitePoint: num(v, "whitePoint"), detailBoost: 0, edgeSensitivity: 0,
      offset: num(v, "offset"), wobble: num(v, "wobble"), wobbleSize: num(v, "wobbleSize"), flatFallback: false,
    }, seed);
    return traceImageFlow(sheet, fields, traceOptions(v), seed, onProgress, signal);
  },
};
