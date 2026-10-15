/// <reference lib="webworker" />
import { runFlowField } from "../algorithms/flowField";
import type { RunMessage, WorkerMessage } from "./protocol";

const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const { job, params } = e.data, t0 = performance.now();
  try {
    const r = runFlowField(params, {
      onFields: ({ direction, tone }, l) =>
        post({ type: "fields", job, tone: tone.data, c: direction.c, s: direction.s, width: l.grid.width, height: l.grid.height, mmPerPx: l.grid.mmPerPx, ox: l.ox, oy: l.oy }),
      onBatch: (paths, progress) => post({ type: "batch", job, paths, progress }),
    });
    post({ type: "done", job, paths: r.paths, before: r.before, after: r.after, ms: performance.now() - t0 });
  } catch (err) {
    post({ type: "error", job, message: err instanceof Error ? err.message : String(err) });
  }
};
