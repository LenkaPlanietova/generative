/** Lissajous curves: x = A sin(a t + δ), y = B sin(b t). */
import { fitToRect, rotate } from "../geometry/shape";
import { type Curve, WOBBLE_PARAMS, applyWobble, num, sample, sheetOf, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "copies", type: "number", group: "Structure", label: "Copies", default: 18, min: 1, max: 60, step: 1,
    description: "Draw several curves, each with the phase shifted by the phase step — makes ribbons." },
  { id: "phaseStep", type: "number", group: "Structure", label: "Phase step", default: 2.5, min: 0.1, max: 90, step: 0.1, unit: "°",
    description: "Phase shift between copies.", visibleWhen: (v) => (v.copies as number) > 1 },
  { id: "freqX", type: "number", group: "Geometry", label: "X frequency", default: 3, min: 1, max: 30, step: 1, description: "a in x = A sin(a t + δ)." },
  { id: "freqY", type: "number", group: "Geometry", label: "Y frequency", default: 4, min: 1, max: 30, step: 1, description: "b in y = B sin(b t)." },
  { id: "phase", type: "number", group: "Geometry", label: "Phase", default: 90, min: 0, max: 359, step: 1, unit: "°", description: "δ, the phase of x." },
  { id: "ampX", type: "number", group: "Geometry", label: "X amplitude", default: 1, min: 0.05, max: 1, step: 0.01, description: "A (relative; the curve is fitted to the paper)." },
  { id: "ampY", type: "number", group: "Geometry", label: "Y amplitude", default: 1, min: 0.05, max: 1, step: 0.01, description: "B (relative)." },
  ...WOBBLE_PARAMS,
  { id: "size", type: "number", group: "Composition", label: "Size", default: 0.94, min: 0.1, max: 1, step: 0.01, unit: "× area", description: "Share of the drawing area the curve fills." },
  { id: "rotation", type: "number", group: "Composition", label: "Rotation", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Rotates the curve." },
  { id: "resolution", type: "number", group: "Advanced", label: "Sampling resolution", default: 3000, min: 100, max: 40000, step: 100, unit: "pts", description: "Points per curve." },
];

export const lissajous: GenerativeAlgorithm = {
  id: "lissajous",
  name: "Lissajous Curves",
  category: "Geometry",
  description: "Closed curves from two perpendicular sine oscillations.",
  parameters,
  usesSeed: (v) => (v.wobble as number) > 0,
  async generate({ params, seed, paper }) {
    const v = resolveParams(lissajous, params), sheet = sheetOf(paper);
    const a = num(v, "freqX"), b = num(v, "freqY"), A = num(v, "ampX"), B = num(v, "ampY"), n = num(v, "resolution");
    const curves = Array.from({ length: num(v, "copies") }, (_, i) => {
      const delta = ((num(v, "phase") + i * num(v, "phaseStep")) * Math.PI) / 180;
      const pts = sample(n, 0, 2 * Math.PI, (t) => ({ x: A * Math.sin(a * t + delta), y: B * Math.sin(b * t) }));
      pts.pop(); // closed
      return rotate(pts, num(v, "rotation"));
    });
    const fitted: Curve[] = fitToRect(curves, sheet.area, num(v, "size")).map((points) => ({ points, closed: true }));
    return toCollection(sheet, applyWobble(fitted, num(v, "wobble"), num(v, "wobbleSize"), seed));
  },
};
