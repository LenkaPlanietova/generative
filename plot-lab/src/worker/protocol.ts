import type { GenerateRequest, GenerateResult } from "../pipeline";
import type { GeometryCollection, PlotPath } from "../geometry/types";

export type WorkerRequest =
  | ({ type: "generate"; job: number } & GenerateRequest)
  | { type: "thumbnail"; job: number; algorithmId: string };

export type WorkerResponse =
  | { type: "progress"; job: number; progress: number; partial: PlotPath[] }
  | ({ type: "done"; job: number } & GenerateResult)
  | { type: "thumbnail"; job: number; algorithmId: string; geometry: GeometryCollection }
  | { type: "error"; job: number; message: string };
