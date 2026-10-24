/** Shared fixture: a Wave Portrait on A3 (line spacing 2.4 mm, ~158 rows) and a hand-made head-and-shoulders mask. */
import { wavePortrait } from "../src/algorithms/wavePortrait";
import { defaultParams } from "../src/algorithms/types";
import { type PaperSettings, sheetFor } from "../src/core/paper";
import type { GeometryCollection, Point } from "../src/geometry/types";
import { DEFAULT_OPTIMIZE, optimize } from "../src/plotter/optimize";
import { DEFAULT_PLOT_LAYERS, type PlotLayerRequest } from "../src/plotter/plotLayers";

export const A3: PaperSettings = { paper: "A3", customWidth: 300, customHeight: 300, orientation: "portrait", margin: 20 };
export const sheetA3 = sheetFor(A3);
export const SEED = 4242;

/** Head (ellipse) on a neck and shoulders that run off the bottom of the drawing area. */
export function headMask(): Point[] {
  const cx = 148, cy = 165, rx = 62, ry = 80, head: Point[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = 0.65 * Math.PI + (k / 24) * 1.7 * Math.PI;
    head.push({ x: Math.round((cx + rx * Math.cos(t)) * 100) / 100, y: Math.round((cy + ry * Math.sin(t)) * 100) / 100 });
  }
  const shoulders: [number, number][] = [[178, 255], [240, 285], [262, 330], [262, 410], [34, 410], [34, 330], [56, 285], [118, 255]];
  return [...head, ...shoulders.map(([x, y]) => ({ x, y }))];
}

let cached: GeometryCollection | null = null;
/** The rows exactly as the pipeline hands them to the split (clean-up only, generator order). */
export async function waveRows(): Promise<GeometryCollection> {
  if (cached) return cached;
  const g = await wavePortrait.generate({ params: { ...defaultParams(wavePortrait), lineSpacing: 2.4 }, seed: SEED, paper: A3 });
  cached = optimize(g, { ...DEFAULT_OPTIMIZE, simplify: 0, order: false, joinGap: 0 });
  return cached;
}

export const request = (over: Partial<PlotLayerRequest> = {}): PlotLayerRequest =>
  ({ ...DEFAULT_PLOT_LAYERS, prime: { ...DEFAULT_PLOT_LAYERS.prime }, enabled: true, mask: headMask(), penWidth: 0.8, ...over });
