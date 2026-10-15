import type { FlowFieldParams } from "../algorithms/flowField";
import type { PlotStats } from "../engine/order";

export interface RunMessage { job: number; params: FlowFieldParams }

export type WorkerMessage =
  | { type: "fields"; job: number; tone: Float32Array; c: Float32Array; s: Float32Array; width: number; height: number; mmPerPx: number; ox: number; oy: number }
  | { type: "batch"; job: number; paths: Float32Array[]; progress: number }
  | { type: "done"; job: number; paths: Float32Array[]; before: PlotStats; after: PlotStats; ms: number }
  | { type: "error"; job: number; message: string };
