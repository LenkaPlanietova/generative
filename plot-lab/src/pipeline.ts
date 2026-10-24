/** Generate → measure → optimise → measure. Runs in the worker; pure, so tests call it directly. */
import { draftParams } from "./algorithms/draft";
import { getAlgorithm } from "./algorithms/registry";
import type { ParamValues } from "./algorithms/types";
import { type PaperSettings, sheetFor } from "./core/paper";
import { type ClipSettings, applyClip } from "./geometry/clipShape";
import type { GeometryCollection, PlotPath } from "./geometry/types";
import type { ImageInputs } from "./image/types";
import { type OptimizeOptions, optimize } from "./plotter/optimize";
import { type PlotLayerReport, type PlotLayerRequest, splitPlotLayers } from "./plotter/plotLayers";
import type { PlotterProfile } from "./plotter/profiles";
import { type PlotStats, plotStats } from "./plotter/stats";

export interface GenerateRequest {
  algorithmId: string;
  params: ParamValues;
  seed: number;
  paper: PaperSettings;
  optimize: OptimizeOptions;
  profile: PlotterProfile;
  /** Only sent to algorithms that declare image inputs. */
  images?: ImageInputs;
  clip?: ClipSettings;
  /** "draft" = quick lower-precision preview while adjusting; exports always use "final". */
  quality?: "draft" | "final";
  /** Safety limit: refuse drawings with more points than this. */
  maxPoints?: number;
  /** Split by a mask into numbered AxiDraw layers (replaces path ordering). */
  plotLayers?: PlotLayerRequest;
  /** Polylines imported from an SVG, used instead of running the algorithm. */
  imported?: GeometryCollection;
}

export const DEFAULT_MAX_POINTS = 3_000_000;

export interface GenerateResult {
  geometry: GeometryCollection;
  before: PlotStats;
  after: PlotStats;
  ms: number;
  plotLayers?: PlotLayerReport;
}

export async function runPipeline(r: GenerateRequest, onProgress?: (progress: number, partial: PlotPath[]) => void, signal?: AbortSignal): Promise<GenerateResult> {
  const algo = getAlgorithm(r.algorithmId);
  if (!algo) throw new Error(`Unknown algorithm "${r.algorithmId}"`);
  const t0 = performance.now();
  const params = r.quality === "draft" ? draftParams(r.algorithmId, r.params) : r.params;
  const generated = r.imported ?? await algo.generate({ params, seed: r.seed, paper: r.paper, images: r.images, onProgress, signal });
  const raw = r.clip ? applyClip(generated, r.clip, sheetFor(r.paper).area) : generated;
  const limit = r.maxPoints ?? DEFAULT_MAX_POINTS;
  let points = 0;
  for (const p of raw.paths) points += p.points.length;
  if (points > limit)
    throw new Error(`This drawing has ${points.toLocaleString("en-US")} points, over the safety limit of ${limit.toLocaleString("en-US")}. Reduce the density, or raise the limit under Advanced → Safety.`);
  if (r.plotLayers?.enabled) {
    // Plot layers keep the rows' order and stroke directions, so only clean-up runs here: no reordering or joining.
    const cleaned = optimize(raw, { ...r.optimize, simplify: 0, order: false, joinGap: 0 });
    const { geometry, report } = splitPlotLayers(cleaned, r.plotLayers, r.seed, sheetFor(r.paper));
    const g = geometry ?? optimize(raw, r.optimize);
    return { geometry: g, before: plotStats(raw, r.profile), after: plotStats(g, r.profile), ms: performance.now() - t0, plotLayers: report };
  }
  const geometry = optimize(raw, r.optimize);
  return { geometry, before: plotStats(raw, r.profile), after: plotStats(geometry, r.profile), ms: performance.now() - t0 };
}
