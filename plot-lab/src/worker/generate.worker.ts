/// <reference lib="webworker" />
import { getAlgorithm } from "../algorithms/registry";
import { defaultParams } from "../algorithms/types";
import { DEFAULT_OPTIMIZE, optimize } from "../plotter/optimize";
import { runPipeline } from "../pipeline";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === "generate") {
      const { type: _type, job, ...req } = m;
      const r = await runPipeline(req, (progress, partial) => post({ type: "progress", job, progress, partial }));
      post({ type: "done", job, ...r });
    } else {
      const algo = getAlgorithm(m.algorithmId);
      if (!algo) throw new Error(`Unknown algorithm "${m.algorithmId}"`);
      // Real geometry, generated small with a coarse field.
      const params = { ...defaultParams(algo), resolution: 250 };
      const g = await algo.generate({ params, seed: 1, paper: { paper: "Square", customWidth: 200, customHeight: 200, orientation: "portrait", margin: 10 } });
      post({ type: "thumbnail", job: m.job, algorithmId: m.algorithmId, geometry: optimize(g, { ...DEFAULT_OPTIMIZE, simplify: 0.3, order: false }) });
    }
  } catch (err) {
    post({ type: "error", job: m.job, message: err instanceof Error ? err.message : String(err) });
  }
};
