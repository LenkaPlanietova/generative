/**
 * Reaction-Diffusion Contours — a Gray-Scott simulation (chemicals A and B) on a grid, exported only as vector
 * contour lines of B. Grid cells have a physical size, so the pattern scale is the same on every paper.
 */
import { rng } from "../core/rng";
import { num, sheetOf, toCollection, traceLevels } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

/** Safety limit: simulation cells. */
export const MAX_CELLS = 400_000;

const parameters: ParameterDefinition[] = [
  { id: "feed", type: "number", group: "Structure", label: "Feed rate", default: 0.0545, min: 0.01, max: 0.1, step: 0.0005,
    description: "How fast A is replenished. With kill 0.062: 0.055 corals, 0.037 dividing spots (kill 0.065), 0.029 mazes (kill 0.057)." },
  { id: "kill", type: "number", group: "Structure", label: "Kill rate", default: 0.062, min: 0.03, max: 0.08, step: 0.0005,
    description: "How fast B decays. Small changes switch between spots, stripes and mazes." },
  { id: "diffA", type: "number", group: "Structure", label: "Diffusion A", default: 1, min: 0.2, max: 1.5, step: 0.01, description: "Diffusion rate of A." },
  { id: "diffB", type: "number", group: "Structure", label: "Diffusion B", default: 0.5, min: 0.1, max: 1, step: 0.01, description: "Diffusion rate of B." },
  { id: "iterations", type: "number", group: "Structure", label: "Iterations", default: 5000, min: 100, max: 20000, step: 100,
    description: "Simulation steps. More lets the pattern grow further across the paper." },
  { id: "cellSize", type: "number", group: "Geometry", label: "Pattern scale", default: 1.1, min: 0.4, max: 4, step: 0.05, unit: "mm/cell",
    description: "Size of one simulation cell. Larger = bigger pattern and faster." },
  { id: "seeds", type: "number", group: "Composition", label: "Seed spots", default: 12, min: 1, max: 120, step: 1,
    description: "Initial spots of B (placed by the seed) that the pattern grows from." },
  { id: "threshold", type: "number", group: "Density", label: "Threshold", default: 0.22, min: 0.05, max: 0.45, step: 0.01,
    description: "Concentration of B where the outline is drawn." },
  { id: "contourCount", type: "number", group: "Density", label: "Contour levels", default: 2, min: 1, max: 8, step: 1,
    description: "Outlines per shape, stepping up from the threshold." },
  { id: "levelStep", type: "number", group: "Density", label: "Level step", default: 0.06, min: 0.01, max: 0.2, step: 0.005,
    description: "Concentration step between outlines.", visibleWhen: (v) => (v.contourCount as number) > 1 },
  { id: "smoothing", type: "number", group: "Advanced", label: "Contour smoothing", default: 2, min: 0, max: 3, step: 1, description: "Chaikin smoothing passes." },
];

/** Gray-Scott, clamped (no-flux) edges. Returns B. */
export function grayScott(W: number, H: number, p: { feed: number; kill: number; dA: number; dB: number; iterations: number; seeds: number; seed: number },
  onStep?: (i: number) => boolean | void): Float32Array {
  const n = W * H, R = rng(p.seed);
  let A = new Float32Array(n).fill(1), B = new Float32Array(n), A2 = new Float32Array(n), B2 = new Float32Array(n);
  for (let s = 0; s < p.seeds; s++) {
    // Pearson's initial condition (A = 0.5, B = 0.25, slightly perturbed): stable with the explicit update.
    const x0 = Math.floor(R() * W), y0 = Math.floor(R() * H), r = 4;
    for (let y = Math.max(0, y0 - r); y < Math.min(H, y0 + r); y++) for (let x = Math.max(0, x0 - r); x < Math.min(W, x0 + r); x++) {
      A[y * W + x] = 0.5 + 0.02 * (R() - 0.5);
      B[y * W + x] = 0.25 + 0.02 * (R() - 0.5);
    }
  }
  const { feed: f, kill: k, dA, dB } = p;
  for (let it = 0; it < p.iterations; it++) {
    for (let y = 0; y < H; y++) {
      const ym = (y > 0 ? y - 1 : 0) * W, yc = y * W, yp = (y < H - 1 ? y + 1 : y) * W;
      for (let x = 0; x < W; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < W - 1 ? x + 1 : x, i = yc + x;
        const lapA = 0.2 * (A[yc + xm] + A[yc + xp] + A[ym + x] + A[yp + x]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) - A[i];
        const lapB = 0.2 * (B[yc + xm] + B[yc + xp] + B[ym + x] + B[yp + x]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) - B[i];
        const a = A[i], b = B[i], abb = a * b * b;
        A2[i] = a + dA * lapA - abb + f * (1 - a);
        B2[i] = b + dB * lapB + abb - (k + f) * b;
      }
    }
    [A, A2] = [A2, A];
    [B, B2] = [B2, B];
    if (onStep && it % 100 === 0 && onStep(it)) break;
  }
  return B;
}

export const reactionDiffusion: GenerativeAlgorithm = {
  id: "reaction-diffusion",
  name: "Reaction-Diffusion",
  category: "Fields",
  description: "Gray-Scott chemistry grown on the paper and traced as smooth organic outlines.",
  parameters,
  async generate({ params, seed, paper, onProgress, signal }) {
    const v = resolveParams(reactionDiffusion, params), sheet = sheetOf(paper), a = sheet.area, cell = num(v, "cellSize");
    const W = Math.max(8, Math.round(a.width / cell) + 1), H = Math.max(8, Math.round(a.height / cell) + 1);
    if (W * H > MAX_CELLS)
      throw new Error(`Pattern scale is too fine for this paper: ${(W * H).toLocaleString("en-US")} cells (limit ${MAX_CELLS.toLocaleString("en-US")}). Increase Pattern scale.`);
    const iterations = num(v, "iterations");
    const B = grayScott(W, H, { feed: num(v, "feed"), kill: num(v, "kill"), dA: num(v, "diffA"), dB: num(v, "diffB"), iterations, seeds: num(v, "seeds"), seed },
      (i) => { onProgress?.(i / iterations, []); return signal?.aborted; });
    const levels = Array.from({ length: num(v, "contourCount") }, (_, k) => num(v, "threshold") + k * num(v, "levelStep"));
    return toCollection(sheet, traceLevels(B, W, H, levels, a, num(v, "smoothing")).flat());
  },
};
