/**
 * Guilloché — bands of interlaced rosettes like banknote engraving. Each band is `repetitions` closed curves
 * r(θ) = R + A·env(θ)·sin(fθ + φ + 2πk/n), so the copies weave into a lattice; integer frequencies keep every curve closed.
 */
import { rotate } from "../geometry/shape";
import type { Point } from "../geometry/types";
import { type Curve, num, sheetOf, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "bands", type: "number", group: "Structure", label: "Bands", default: 2, min: 1, max: 10, step: 1, description: "Concentric rosette bands." },
  { id: "repetitions", type: "number", group: "Structure", label: "Repetitions", default: 16, min: 1, max: 80, step: 1,
    description: "Phase-shifted copies per band; they interlace into the engraved lattice." },
  { id: "baseRadius", type: "number", group: "Geometry", label: "Base radius", default: 30, min: 2, max: 400, step: 0.5, unit: "mm", description: "Radius of the innermost band." },
  { id: "lineSpacing", type: "number", group: "Geometry", label: "Line spacing", default: 32, min: 1, max: 100, step: 0.5, unit: "mm", description: "Distance between bands." },
  { id: "frequency", type: "number", group: "Geometry", label: "Frequency", default: 10, min: 1, max: 120, step: 1, description: "Waves around each curve." },
  { id: "bandFrequencyStep", type: "number", group: "Geometry", label: "Frequency step per band", default: 8, min: 0, max: 40, step: 1,
    description: "Adds waves on each outer band, so the outer lattices are finer." },
  { id: "amplitude", type: "number", group: "Distortion", label: "Amplitude", default: 14, min: 0, max: 60, step: 0.1, unit: "mm", description: "Depth of the waves." },
  { id: "symmetry", type: "number", group: "Distortion", label: "Symmetry", default: 6, min: 0, max: 24, step: 1,
    description: "Lobes of the slow envelope that swells and narrows the waves around the circle. 0 = even." },
  { id: "envelopeDepth", type: "number", group: "Distortion", label: "Envelope depth", default: 0.7, min: 0, max: 1, step: 0.01,
    description: "How strongly the envelope narrows the waves.", visibleWhen: (v) => (v.symmetry as number) > 0 },
  { id: "phase", type: "number", group: "Distortion", label: "Phase", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Phase of the waves." },
  { id: "rotation", type: "number", group: "Composition", label: "Rotation", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Rotates the whole rosette." },
  { id: "centreX", type: "number", group: "Composition", label: "Centre X", default: 0, min: -300, max: 300, step: 1, unit: "mm", description: "Horizontal offset from the middle." },
  { id: "centreY", type: "number", group: "Composition", label: "Centre Y", default: 0, min: -300, max: 300, step: 1, unit: "mm", description: "Vertical offset from the middle." },
  { id: "segment", type: "number", group: "Advanced", label: "Segment length", default: 0.4, min: 0.05, max: 3, step: 0.05, unit: "mm", description: "Distance between points along a curve." },
];

export const guilloche: GenerativeAlgorithm = {
  id: "guilloche",
  name: "Guilloché",
  category: "Patterns",
  description: "Interlaced rosette bands of precise closed curves, like engraving on banknotes.",
  parameters,
  usesSeed: () => false,
  async generate({ params, paper }) {
    const v = resolveParams(guilloche, params), sheet = sheetOf(paper), a = sheet.area;
    const cx = a.x + a.width / 2 + num(v, "centreX"), cy = a.y + a.height / 2 + num(v, "centreY");
    const n = num(v, "repetitions"), A = num(v, "amplitude"), sym = num(v, "symmetry"), depth = num(v, "envelopeDepth");
    const ph = (num(v, "phase") * Math.PI) / 180, curves: Curve[] = [];
    for (let b = 0; b < num(v, "bands"); b++) {
      const R = num(v, "baseRadius") + b * num(v, "lineSpacing"), f = num(v, "frequency") + b * num(v, "bandFrequencyStep");
      const m = Math.max(64, Math.ceil((2 * Math.PI * (R + A)) / num(v, "segment")));
      for (let k = 0; k < n; k++) {
        const pts: Point[] = [];
        for (let s = 0; s < m; s++) {
          const t = (s / m) * 2 * Math.PI, env = sym > 0 ? 1 - depth * (0.5 - 0.5 * Math.cos(sym * t)) : 1;
          const r = Math.max(0, R + A * env * Math.sin(f * t + ph + (2 * Math.PI * k) / n));
          pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
        }
        curves.push({ points: rotate(pts, num(v, "rotation"), cx, cy), closed: true });
      }
    }
    return toCollection(sheet, curves);
  },
};
