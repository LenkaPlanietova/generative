/**
 * Variation explorer (spec §14): related versions of the current piece — same algorithm, new seeds and/or a
 * controlled, seeded mutation of the creative parameters. Composition (position, size), image placement, quality
 * settings and the pen-safety spacing stay as the artist set them.
 */
import { type GenerativeAlgorithm, type ParamValues, resolveParams } from "../algorithms/types";
import { rng } from "../core/rng";
import { MAX_SEED } from "../store/settings";

export type VariationMode = "seed" | "mutate" | "both";
export interface Variation { seed: number; params: ParamValues }

const FIXED_GROUPS = new Set(["Image", "Advanced", "Composition"]);

export function makeVariations(algo: GenerativeAlgorithm, params: ParamValues, seed: number, count: number, mode: VariationMode, amount: number, round: number): Variation[] {
  const base = resolveParams(algo, params);
  return Array.from({ length: count }, (_, i) => {
    const R = rng((seed * 2654435761 + round * 40503 + (i + 1) * 9973) >>> 0);
    const nextSeed = mode === "mutate" ? seed : 1 + Math.floor(R() * MAX_SEED);
    if (mode === "seed") return { seed: nextSeed, params: base };
    const p: ParamValues = { ...base };
    for (const d of algo.parameters) {
      if (d.type !== "number" || FIXED_GROUPS.has(d.group) || d.role === "minSpacing") continue;
      if (d.visibleWhen && !d.visibleWhen(base)) continue;
      const span = d.max - d.min, v = (base[d.id] as number) + (R() * 2 - 1) * amount * span;
      p[d.id] = Math.min(d.max, Math.max(d.min, d.min + Math.round((v - d.min) / d.step) * d.step));
    }
    return { seed: nextSeed, params: resolveParams(algo, p) };
  });
}
