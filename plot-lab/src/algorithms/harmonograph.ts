/** Harmonograph — two damped pendulums per axis: x = Σ Aᵢ sin(2π fᵢ t + pᵢ) e^(−d t). */
import { rng } from "../core/rng";
import { fitToRect, rotate } from "../geometry/shape";
import { WOBBLE_PARAMS, applyWobble, num, sample, sheetOf, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const osc = (axis: "x" | "y", i: 1 | 2, f: number, p: number): ParameterDefinition[] => [
  { id: `f${axis}${i}`, type: "number", group: "Geometry", label: `${axis.toUpperCase()} frequency ${i}`, default: f, min: 0.1, max: 8, step: 0.001, unit: "Hz",
    description: `Frequency of ${axis} pendulum ${i}. Near-integer ratios between pendulums give the classic slowly turning figures.` },
  { id: `p${axis}${i}`, type: "number", group: "Distortion", label: `${axis.toUpperCase()} phase ${i}`, default: p, min: 0, max: 359, step: 1, unit: "°",
    description: `Starting phase of ${axis} pendulum ${i}.` },
  { id: `a${axis}${i}`, type: "number", group: "Composition", label: `${axis.toUpperCase()} amplitude ${i}`, default: 1, min: 0, max: 1, step: 0.01,
    description: `Swing of ${axis} pendulum ${i} (relative; the drawing is fitted to the paper).` },
];

const parameters: ParameterDefinition[] = [
  { id: "duration", type: "number", group: "Structure", label: "Duration", default: 80, min: 5, max: 900, step: 1, unit: "s", description: "How long the pendulums swing." },
  { id: "damping", type: "number", group: "Structure", label: "Damping", default: 0.02, min: 0, max: 0.2, step: 0.001, unit: "/s", description: "How fast the swing dies away." },
  ...osc("x", 1, 2.01, 0), ...osc("x", 2, 3, 90), ...osc("y", 1, 3, 0), ...osc("y", 2, 2.005, 45),
  { id: "detune", type: "number", group: "Noise", label: "Seeded detune", default: 0, min: 0, max: 0.05, step: 0.0005, unit: "Hz",
    description: "Random offset of every frequency, from the seed. 0 = exact frequencies." },
  ...WOBBLE_PARAMS,
  { id: "size", type: "number", group: "Composition", label: "Size", default: 0.94, min: 0.1, max: 1, step: 0.01, unit: "× area", description: "Share of the drawing area the drawing fills." },
  { id: "rotation", type: "number", group: "Composition", label: "Rotation", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Rotates the drawing." },
  { id: "resolution", type: "number", group: "Advanced", label: "Sampling resolution", default: 120, min: 10, max: 1000, step: 5, unit: "pts/s", description: "Points per second of swing." },
];

export const harmonograph: GenerativeAlgorithm = {
  id: "harmonograph",
  name: "Harmonograph",
  category: "Geometry",
  description: "Damped harmonic oscillations of two pendulum pairs, one continuous line.",
  parameters,
  usesSeed: (v) => (v.detune as number) > 0 || (v.wobble as number) > 0,
  seedHint: "Turn up Seeded detune or Wobble amount to use it.",
  async generate({ params, seed, paper }) {
    const v = resolveParams(harmonograph, params), sheet = sheetOf(paper), R = rng(seed);
    const det = num(v, "detune"), d = num(v, "damping"), T = num(v, "duration");
    const o = (axis: string, i: number) => ({
      w: 2 * Math.PI * (num(v, `f${axis}${i}`) + (R() * 2 - 1) * det),
      p: (num(v, `p${axis}${i}`) * Math.PI) / 180,
      a: num(v, `a${axis}${i}`),
    });
    const x1 = o("x", 1), x2 = o("x", 2), y1 = o("y", 1), y2 = o("y", 2);
    const pts = sample(Math.max(10, Math.round(T * num(v, "resolution"))), 0, T, (t) => {
      const e = Math.exp(-d * t);
      return {
        x: (x1.a * Math.sin(x1.w * t + x1.p) + x2.a * Math.sin(x2.w * t + x2.p)) * e,
        y: (y1.a * Math.sin(y1.w * t + y1.p) + y2.a * Math.sin(y2.w * t + y2.p)) * e,
      };
    });
    const [fitted] = fitToRect([rotate(pts, num(v, "rotation"))], sheet.area, num(v, "size"));
    return toCollection(sheet, applyWobble([{ points: fitted, closed: false }], num(v, "wobble"), num(v, "wobbleSize"), seed));
  },
};
