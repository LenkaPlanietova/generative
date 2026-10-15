/** Generate → measure → optimise → measure. Runs in the worker; pure, so tests call it directly. */
import { getAlgorithm } from "./algorithms/registry";
import type { ParamValues } from "./algorithms/types";
import type { PaperSettings } from "./core/paper";
import type { GeometryCollection, PlotPath } from "./geometry/types";
import type { ImageInputs } from "./image/types";
import { type OptimizeOptions, optimize } from "./plotter/optimize";
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
}

export interface GenerateResult {
  geometry: GeometryCollection;
  before: PlotStats;
  after: PlotStats;
  ms: number;
}

export async function runPipeline(r: GenerateRequest, onProgress?: (progress: number, partial: PlotPath[]) => void, signal?: AbortSignal): Promise<GenerateResult> {
  const algo = getAlgorithm(r.algorithmId);
  if (!algo) throw new Error(`Unknown algorithm "${r.algorithmId}"`);
  const t0 = performance.now();
  const raw = await algo.generate({ params: r.params, seed: r.seed, paper: r.paper, images: r.images, onProgress, signal });
  const geometry = optimize(raw, r.optimize);
  return { geometry, before: plotStats(raw, r.profile), after: plotStats(geometry, r.profile), ms: performance.now() - t0 };
}
