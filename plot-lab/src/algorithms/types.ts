import type { PaperSettings } from "../core/paper";
import type { GeometryCollection, PlotPath } from "../geometry/types";

export type ParamGroup = "Structure" | "Geometry" | "Distortion" | "Noise" | "Density" | "Stroke" | "Composition" | "Advanced";
export const PARAM_GROUPS: ParamGroup[] = ["Structure", "Geometry", "Distortion", "Noise", "Density", "Stroke", "Composition", "Advanced"];

export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

interface ParamBase {
  id: string;
  label: string;
  description: string;
  group: ParamGroup;
  /** Hide the control when it has no effect for the current values. */
  visibleWhen?: (values: ParamValues) => boolean;
}

export interface NumberParam extends ParamBase {
  type: "number";
  default: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Marks the parameter the pen-width ↔ spacing check reads. */
  role?: "minSpacing";
}
export interface BooleanParam extends ParamBase {
  type: "boolean";
  default: boolean;
}
export interface SelectParam extends ParamBase {
  type: "select";
  default: string;
  options: { value: string; label: string }[];
}

export type ParameterDefinition = NumberParam | BooleanParam | SelectParam;

export interface GenerationSettings {
  params: ParamValues;
  seed: number;
  paper: PaperSettings;
  /** Stream partial geometry (sheet mm) for live preview. */
  onProgress?: (progress: number, partial: PlotPath[]) => void;
  signal?: AbortSignal;
}

export interface GenerativeAlgorithm {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: ParameterDefinition[];
  generate(settings: GenerationSettings): Promise<GeometryCollection>;
}

export function defaultParams(a: Pick<GenerativeAlgorithm, "parameters">): ParamValues {
  return Object.fromEntries(a.parameters.map((p) => [p.id, p.default]));
}

/** Fill in missing values and clamp numbers into range, so saved settings can never break an algorithm. */
export function resolveParams(a: Pick<GenerativeAlgorithm, "parameters">, values: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of a.parameters) {
    const v = values[p.id];
    if (p.type === "number") out[p.id] = typeof v === "number" && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    else if (p.type === "boolean") out[p.id] = typeof v === "boolean" ? v : p.default;
    else out[p.id] = typeof v === "string" && p.options.some((o) => o.value === v) ? v : p.default;
  }
  return out;
}
