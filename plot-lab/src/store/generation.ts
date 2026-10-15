import { create } from "zustand";
import type { GeometryCollection, PlotPath } from "../geometry/types";
import type { PlotStats } from "../plotter/stats";
import type { GenerateRequest } from "../pipeline";
import type { WorkerRequest, WorkerResponse } from "../worker/protocol";
import GenerateWorker from "../worker/generate.worker.ts?worker";
import { getAlgorithm } from "../algorithms/registry";
import { useImages } from "./images";
import { currentParams, useSettings } from "./settings";

export interface GenerationState {
  status: "idle" | "generating" | "done" | "error";
  progress: number;
  partial: PlotPath[];
  geometry: GeometryCollection | null;
  /** The request that produced `geometry`. */
  request: GenerateRequest | null;
  before: PlotStats | null;
  after: PlotStats | null;
  ms: number;
  error: string | null;
  thumbnails: Record<string, GeometryCollection>;
}

export const useGeneration = create<GenerationState>()(() => ({
  status: "idle", progress: 0, partial: [], geometry: null, request: null, before: null, after: null, ms: 0, error: null, thumbnails: {},
}));

let worker: Worker | null = null, job = 0, timer = 0;

export function requestFromSettings(): GenerateRequest {
  const s = useSettings.getState(), inputs = getAlgorithm(s.algorithmId)?.inputs, im = useImages.getState();
  const images = inputs ? { photo: inputs.photo ? im.photo : undefined, depth: inputs.depth ? im.depth : undefined } : undefined;
  return { algorithmId: s.algorithmId, params: currentParams(s), seed: s.seed, paper: s.paper, optimize: s.optimize, profile: s.profile, images };
}

/** The parts of a request that change the geometry (plotter speeds only change the statistics). */
export const geometryKey = (r: GenerateRequest) =>
  JSON.stringify([r.algorithmId, r.params, r.seed, r.paper, r.optimize, r.images?.photo?.id, r.images?.depth?.id]);

/** Start a generation now, cancelling any running one (the worker is terminated, not asked politely). */
export function generateNow(): void {
  clearTimeout(timer);
  worker?.terminate();
  worker = new GenerateWorker();
  const my = ++job, request = requestFromSettings();
  let partial: PlotPath[] = [];
  useGeneration.setState({ status: "generating", progress: 0, partial, error: null });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.job !== my) return;
    if (m.type === "progress") {
      partial = partial.concat(m.partial);
      useGeneration.setState({ progress: m.progress, partial });
    } else if (m.type === "done") {
      useGeneration.setState({ status: "done", progress: 1, partial: [], geometry: m.geometry, request, before: m.before, after: m.after, ms: m.ms });
    } else if (m.type === "error") {
      useGeneration.setState({ status: "error", error: m.message });
    }
  };
  worker.onerror = (e) => useGeneration.setState({ status: "error", error: e.message || "Generation failed" });
  worker.postMessage({ type: "generate", job: my, ...request } satisfies WorkerRequest);
}

/** Debounced regeneration after parameter changes. */
export function scheduleGenerate(delay = 300): void {
  clearTimeout(timer);
  timer = window.setTimeout(generateNow, delay);
}

export function loadThumbnails(ids: string[]): void {
  const w = new GenerateWorker();
  let pending = ids.length;
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.type === "thumbnail") useGeneration.setState((s) => ({ thumbnails: { ...s.thumbnails, [m.algorithmId]: m.geometry } }));
    if (m.type === "thumbnail" || m.type === "error") if (--pending === 0) w.terminate();
  };
  ids.forEach((algorithmId, i) => w.postMessage({ type: "thumbnail", job: -1 - i, algorithmId } satisfies WorkerRequest));
}

/** Regenerate whenever settings that affect geometry change (if Auto is on). */
export function startAutoGenerate(): () => void {
  let last = geometryKey(requestFromSettings());
  const check = () => {
    const next = geometryKey(requestFromSettings());
    if (next === last) return;
    last = next;
    if (useSettings.getState().auto) scheduleGenerate();
  };
  const a = useSettings.subscribe(check), b = useImages.subscribe(check);
  return () => { a(); b(); };
}
