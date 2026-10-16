import { create } from "zustand";
import type { GeometryCollection, PlotPath } from "../geometry/types";
import type { PlotStats } from "../plotter/stats";
import type { GenerateRequest, GenerateResult } from "../pipeline";
import { hasDraft } from "../algorithms/draft";
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
  /** Quality of the generation in progress. */
  generatingQuality: "draft" | "final";
  /** The shown result came from the cache. */
  cached: boolean;
}

export const useGeneration = create<GenerationState>()(() => ({
  status: "idle", progress: 0, partial: [], geometry: null, request: null, before: null, after: null, ms: 0, error: null, thumbnails: {},
  generatingQuality: "final", cached: false,
}));

let worker: Worker | null = null, job = 0, draftTimer = 0, finalTimer = 0;

export function requestFromSettings(): GenerateRequest {
  const s = useSettings.getState(), inputs = getAlgorithm(s.algorithmId)?.inputs, im = useImages.getState();
  const images = inputs ? { photo: inputs.photo ? im.photo : undefined, depth: inputs.depth ? im.depth : undefined } : undefined;
  return {
    algorithmId: s.algorithmId, params: currentParams(s), seed: s.seed, paper: s.paper, optimize: s.optimize, profile: s.profile,
    images, clip: s.clip, quality: "final", maxPoints: s.maxPoints,
  };
}

/** The parts of a request that change the geometry (plotter speeds only change the statistics). */
export const geometryKey = (r: GenerateRequest) =>
  JSON.stringify([r.algorithmId, r.params, r.seed, r.paper, r.optimize, r.images?.photo?.id, r.images?.depth?.id, r.clip?.enabled ? r.clip : null, r.maxPoints]);

/** Recent full-quality results, so returning to an earlier setting is instant. */
const CACHE_SIZE = 12;
const cache = new Map<string, GenerateResult>();
function remember(key: string, r: GenerateResult): void {
  cache.delete(key);
  cache.set(key, r);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}
export const cachedResults = () => cache.size;

function cancelTimers(): void {
  clearTimeout(draftTimer);
  clearTimeout(finalTimer);
}

/** Start a generation now, cancelling any running one (the worker is terminated, not asked politely). */
export function generateNow(quality: "draft" | "final" = "final"): void {
  if (quality === "final") cancelTimers();
  const request = { ...requestFromSettings(), quality }, key = geometryKey(request);
  const hit = quality === "final" ? cache.get(key) : undefined;
  if (hit) {
    worker?.terminate();
    worker = null;
    job++;
    cache.delete(key);
    cache.set(key, hit); // most recently used
    useGeneration.setState({ status: "done", progress: 1, partial: [], geometry: hit.geometry, request, before: hit.before, after: hit.after, ms: 0, error: null, cached: true });
    return;
  }
  worker?.terminate();
  worker = new GenerateWorker();
  const my = ++job, shown = useGeneration.getState().request;
  // Stream lines into the preview only when nothing comparable is on screen; otherwise keep showing the
  // previous drawing (or the draft) until the new one is complete — no flicker while adjusting.
  const stream = !shown || shown.algorithmId !== request.algorithmId || JSON.stringify(shown.paper) !== JSON.stringify(request.paper);
  let partial: PlotPath[] = [];
  useGeneration.setState({ status: "generating", progress: 0, partial, error: null, generatingQuality: quality });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.job !== my) return;
    if (m.type === "progress") {
      if (stream) partial = partial.concat(m.partial);
      useGeneration.setState({ progress: m.progress, partial });
    } else if (m.type === "done") {
      const { type: _t, job: _j, ...result } = m;
      if (quality === "final") remember(key, result);
      useGeneration.setState({ status: "done", progress: 1, partial: [], geometry: m.geometry, request, before: m.before, after: m.after, ms: m.ms, cached: false });
    } else if (m.type === "error") {
      useGeneration.setState({ status: "error", error: m.message });
    }
  };
  worker.onerror = (e) => useGeneration.setState({ status: "error", error: e.message || "Generation failed" });
  worker.postMessage({ type: "generate", job: my, ...request } satisfies WorkerRequest);
}

/**
 * Regeneration after a change. Algorithms with a draft mode show a quick low-precision draft almost at once and
 * the full-quality drawing after a pause in the changes; cached results appear immediately.
 */
export function scheduleGenerate(): void {
  cancelTimers();
  const r = requestFromSettings();
  if (cache.has(geometryKey(r))) { finalTimer = window.setTimeout(() => generateNow("final"), 30); return; }
  if (hasDraft(r.algorithmId)) {
    draftTimer = window.setTimeout(() => generateNow("draft"), 90);
    finalTimer = window.setTimeout(() => generateNow("final"), 700);
  } else finalTimer = window.setTimeout(() => generateNow("final"), 250);
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
