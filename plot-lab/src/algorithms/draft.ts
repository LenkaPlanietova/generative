/**
 * Adaptive preview quality: how each algorithm is made cheaper for a quick draft while the artist is still
 * adjusting. Only quality parameters change (field resolution, sample spacing), never the creative ones, so the
 * draft shows the same drawing at lower precision. Algorithms that are already fast — or whose look depends on
 * the expensive part (reaction-diffusion iterations) — have no draft and always render at full quality.
 */
import { getAlgorithm } from "./registry";
import { type ParamValues, resolveParams } from "./types";

export const DRAFT_SCALE: Record<string, Record<string, number>> = {
  "flow-field": { resolution: 0.4 },
  "noise-flow": { resolution: 0.45 },
  contour: { resolution: 0.5 },
  topographic: { resolution: 0.5 },
  interference: { resolution: 0.5 },
  redraw: { resolution: 0.4 },
  "contour-portrait": { resolution: 0.45 },
  "wave-portrait": { step: 2.5 },
  displacement: { step: 2.5 },
  hatching: { step: 2 },
  guilloche: { segment: 2.5 },
  moire: { step: 2.5 },
  radial: { segment: 2.5 },
  wave: { step: 2.5 },
};

export const hasDraft = (algorithmId: string) => algorithmId in DRAFT_SCALE;

/** Draft-quality parameters for the algorithm, or the same parameters when it has no draft. */
export function draftParams(algorithmId: string, params: ParamValues): ParamValues {
  const algo = getAlgorithm(algorithmId), scale = DRAFT_SCALE[algorithmId];
  if (!algo || !scale) return params;
  const out = { ...params };
  for (const [id, k] of Object.entries(scale)) if (typeof out[id] === "number") out[id] = (out[id] as number) * k;
  return resolveParams(algo, out); // clamps into each parameter's range
}
