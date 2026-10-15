/**
 * Contour Portrait — the sculptural portrait engine (spec §8, SPEC_ADDENDUM §D.2). Lines wrap around the form
 * along the contours of a depth map (plus a little photo relief); spacing comes from the photo, so the face reads
 * through density while the lines stay continuous. Without a depth map the photo's own structure steers the lines.
 */
import { chaikin } from "../geometry/shape";
import { rdpPoints } from "../plotter/optimize";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { num, sheetOf } from "./common";
import { imageFlowFields, traceImageFlow } from "./imageFlow";
import { STREAM_PARAMS, traceOptions } from "./redraw";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

// Spec §8 controls; the spacing pair keeps the familiar darkest / lightest names.
const stream = STREAM_PARAMS({ dark: 0.6, light: 2.8, gamma: 1.2, white: 0.97, clearance: 0.5, minLen: 6, turn: 35, seedClear: 0.8, selfAvoid: "line" })
  .map((p) => p.id === "darkestSpacing" ? { ...p, label: "Shadow density (darkest spacing)", description: "Gap between lines in the shadows. Larger keeps the darks from turning into black masses." }
    : p.id === "lightestSpacing" ? { ...p, label: "Highlight spacing" , description: "Gap between lines in the highlights." } : p);

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  ...stream,
  { id: "lineDensity", type: "number", group: "Density", label: "Line density", default: 1, min: 0.4, max: 2.5, step: 0.05, unit: "×",
    description: "Scales all spacings: 2 = twice as many lines." },
  { id: "detailPreservation", type: "number", group: "Density", label: "Detail preservation", default: 0.6, min: 0, max: 3, step: 0.05,
    description: "Local-contrast boost, so eyes, nostrils and lips keep their definition." },
  { id: "edgeSensitivity", type: "number", group: "Density", label: "Edge sensitivity", default: 0.25, min: 0, max: 1, step: 0.01,
    description: "Adds lines along strong edges (jawline, eyelids)." },
  { id: "fidelity", type: "number", group: "Geometry", label: "Portrait fidelity", default: 0.65, min: 0, max: 1, step: 0.01,
    description: "How closely lines follow small features. Lower = calmer, longer curves." },
  { id: "abstraction", type: "number", group: "Geometry", label: "Abstraction", default: 0.3, min: 0, max: 1, step: 0.01,
    description: "How much the overall head shape, rather than detail, steers the lines." },
  { id: "relief", type: "number", group: "Geometry", label: "Photo relief", default: 0.3, min: 0, max: 1, step: 0.01,
    description: "Mixes photo brightness into the depth, so lines also wrap around brows, lips and shadows." },
  { id: "offset", type: "number", group: "Distortion", label: "Flow direction", default: 0, min: -90, max: 90, step: 1, unit: "°",
    description: "0° = lines wrap around the form like contours, 90° = they run down the slopes." },
  { id: "curveSmoothing", type: "number", group: "Distortion", label: "Curve smoothing", default: 0.1, min: 0, max: 1, step: 0.01, unit: "mm",
    description: "Simplify within this tolerance, then round the corners." },
  { id: "toneBlur", type: "number", group: "Advanced", label: "Tone smoothing", default: 0.8, min: 0, max: 10, step: 0.05, unit: "mm", description: "Blur of the brightness used for spacing." },
  { id: "whitePoint", type: "number", group: "Advanced", label: "White point", default: 0.98, min: 0.5, max: 1, step: 0.005, description: "Brightness that counts as paper white." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 1100, min: 300, max: 2400, step: 50, unit: "px", description: "Calculation grid along the long side." },
];

export const contourPortrait: GenerativeAlgorithm = {
  id: "contour-portrait",
  name: "Contour Portrait",
  category: "Image-driven",
  description: "Sculptural portrait: continuous lines wrap the face along a depth map; shading comes from spacing.",
  parameters,
  inputs: { photo: true, depth: true },
  async generate({ params, seed, paper, images, onProgress, signal }) {
    const v = resolveParams(contourPortrait, params), sheet = sheetOf(paper), sample = sampleImages();
    const photo = images?.photo ?? sample.photo, depth = images?.depth ?? (images?.photo ? undefined : sample.depth);
    const fid = num(v, "fidelity"), abs = num(v, "abstraction"), k = 1 / num(v, "lineDensity");
    const fields = imageFlowFields(sheet, {
      photo, depth, relief: num(v, "relief"), adjust: adjustFrom(v), resolution: num(v, "resolution"),
      preBlur: 0.3, detail: 4 - 3.5 * fid, swirlSize: 6 + 30 * abs, swirlStrength: 0.2 + 2.8 * abs,
      toneBlur: num(v, "toneBlur"), whitePoint: num(v, "whitePoint"), detailBoost: num(v, "detailPreservation"),
      edgeSensitivity: num(v, "edgeSensitivity"), offset: num(v, "offset"), wobble: 0, wobbleSize: 10, flatFallback: true,
    }, seed);
    const t = traceOptions(v);
    const g = traceImageFlow(sheet, fields, { ...t, darkestSpacing: t.darkestSpacing * k, lightestSpacing: t.lightestSpacing * k }, seed, onProgress, signal);
    const s = num(v, "curveSmoothing");
    if (s > 0) g.paths = g.paths.map((p) => ({ ...p, points: chaikin(rdpPoints(p.points, s), false, 2) }));
    return g;
  },
};
