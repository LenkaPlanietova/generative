/** Spirograph — hypotrochoids (wheel inside the ring) and epitrochoids (wheel outside). */
import { fitToRect, gcd, rotate } from "../geometry/shape";
import { type Curve, WOBBLE_PARAMS, applyWobble, num, sample, sheetOf, str, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "type", type: "select", group: "Structure", label: "Type", default: "hypo",
    options: [{ value: "hypo", label: "Hypotrochoid (inside)" }, { value: "epi", label: "Epitrochoid (outside)" }],
    description: "Whether the rolling wheel turns inside or outside the fixed ring." },
  { id: "rotations", type: "number", group: "Structure", label: "Rotations", default: 0, min: 0, max: 200, step: 1,
    description: "Turns of the wheel around the ring. 0 = exactly enough to close the curve." },
  { id: "copies", type: "number", group: "Structure", label: "Copies", default: 1, min: 1, max: 24, step: 1,
    description: "Repeat the curve, each copy rotated." },
  { id: "copyRotation", type: "number", group: "Structure", label: "Copy rotation", default: 7.5, min: 0, max: 180, step: 0.5, unit: "°",
    description: "Rotation between copies.", visibleWhen: (v) => (v.copies as number) > 1 },
  { id: "fixedRadius", type: "number", group: "Geometry", label: "Fixed radius", default: 105, min: 1, max: 240, step: 1,
    description: "Size of the fixed ring (in teeth: only the ratios matter; the curve is fitted to the paper)." },
  { id: "rollingRadius", type: "number", group: "Geometry", label: "Rolling radius", default: 39, min: 1, max: 240, step: 1,
    description: "Size of the rolling wheel. The ratio to the fixed radius sets the number of lobes." },
  { id: "penOffset", type: "number", group: "Geometry", label: "Pen offset", default: 62, min: 0, max: 300, step: 1,
    description: "Distance of the pen hole from the wheel's centre." },
  { id: "phase", type: "number", group: "Geometry", label: "Phase", default: 0, min: 0, max: 359, step: 1, unit: "°",
    description: "Starting angle of the wheel." },
  ...WOBBLE_PARAMS,
  { id: "size", type: "number", group: "Composition", label: "Size", default: 0.94, min: 0.1, max: 1, step: 0.01, unit: "× area",
    description: "Share of the drawing area the curve fills." },
  { id: "rotation", type: "number", group: "Composition", label: "Rotation", default: 0, min: 0, max: 359, step: 1, unit: "°",
    description: "Rotates the whole drawing." },
  { id: "resolution", type: "number", group: "Advanced", label: "Sampling resolution", default: 720, min: 60, max: 4000, step: 10, unit: "pts/turn",
    description: "Points per rotation of the wheel around the ring." },
];

export const spirograph: GenerativeAlgorithm = {
  id: "spirograph",
  name: "Spirograph",
  category: "Geometry",
  description: "Hypotrochoid and epitrochoid curves traced by a pen in a rolling wheel.",
  parameters,
  usesSeed: (v) => (v.wobble as number) > 0,
  async generate({ params, seed, paper }) {
    const v = resolveParams(spirograph, params), sheet = sheetOf(paper);
    const R = num(v, "fixedRadius"), r = num(v, "rollingRadius"), d = num(v, "penOffset"), epi = str(v, "type") === "epi";
    const auto = num(v, "rotations") === 0, turns = auto ? r / gcd(R, r) : num(v, "rotations");
    const ph = (num(v, "phase") * Math.PI) / 180, k = epi ? (R + r) / r : (R - r) / r, big = epi ? R + r : R - r;
    const n = Math.max(8, Math.round(turns * num(v, "resolution")));
    const base = sample(n, 0, turns * 2 * Math.PI, (t) => ({
      x: big * Math.cos(t) + (epi ? -d : d) * Math.cos(k * t + ph),
      y: big * Math.sin(t) - d * Math.sin(k * t + ph),
    }));
    if (auto) base.pop(); // closed: the last sample repeats the first
    const curves = Array.from({ length: num(v, "copies") }, (_, i) => rotate(base, num(v, "rotation") + i * num(v, "copyRotation")));
    const fitted: Curve[] = fitToRect(curves, sheet.area, num(v, "size")).map((points) => ({ points, closed: auto }));
    return toCollection(sheet, applyWobble(fitted, num(v, "wobble"), num(v, "wobbleSize"), seed));
  },
};
