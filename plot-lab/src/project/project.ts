/**
 * Project files (spec §13): everything needed to regenerate a piece — algorithm, parameters, seed, paper, stroke,
 * plotter, optimisation, clip and plot-layer settings (mask included), plus reference images embedded as PNG (16-bit images stay 16-bit).
 */
import { encode } from "fast-png";
import { getAlgorithm } from "../algorithms/registry";
import { type ParamValues, resolveParams } from "../algorithms/types";
import { DEFAULT_PAPER, PAPER_NAMES, type PaperSettings } from "../core/paper";
import { type ClipSettings, DEFAULT_CLIP } from "../geometry/clipShape";
import { decodePngGray } from "../image/decode";
import type { GrayImage, ImageInputs } from "../image/types";
import { DEFAULT_OPTIMIZE, type OptimizeOptions } from "../plotter/optimize";
import { type PlotLayerSettings, sanitizePlotLayers } from "../plotter/plotLayers";
import { DEFAULT_PROFILE, type PlotterProfile } from "../plotter/profiles";

export const PROJECT_FORMAT = "plot-lab-project";
export const PROJECT_VERSION = 1;

export interface EmbeddedImage { name: string; bits: number; png: string }

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  savedAt: string;
  algorithmId: string;
  params: ParamValues;
  seed: number;
  paper: PaperSettings;
  profile: PlotterProfile;
  penWidth: number;
  strokeColor: string;
  paperColor: string;
  optimize: OptimizeOptions;
  clip: ClipSettings;
  /** Absent in files saved before Plot Layers; loads as the defaults. */
  plotLayers?: PlotLayerSettings;
  images?: { photo?: EmbeddedImage; depth?: EmbeddedImage };
}

export type ProjectState = Pick<ProjectFile, "algorithmId" | "seed" | "paper" | "profile" | "penWidth" | "strokeColor" | "paperColor" | "optimize" | "clip"> & {
  projectName: string;
  params: Record<string, ParamValues>;
  plotLayers?: PlotLayerSettings;
};

function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B) return new Uint8Array(B.from(b64, "base64"));
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function embedImage(img: GrayImage): EmbeddedImage {
  const sixteen = img.bits > 8, max = sixteen ? 65535 : 255, n = img.width * img.height;
  const data = sixteen ? new Uint16Array(n) : new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round(Math.min(1, Math.max(0, img.data[i])) * max);
  return { name: img.name, bits: sixteen ? 16 : 8, png: toBase64(encode({ width: img.width, height: img.height, data, depth: sixteen ? 16 : 8, channels: 1 })) };
}

export function unembedImage(e: EmbeddedImage): GrayImage {
  return decodePngGray(fromBase64(e.png), e.name);
}

export function makeProject(s: ProjectState, images: ImageInputs = {}, includeImages = true): ProjectFile {
  const algo = getAlgorithm(s.algorithmId);
  const p: ProjectFile = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, name: s.projectName, savedAt: new Date().toISOString(),
    algorithmId: s.algorithmId, params: algo ? resolveParams(algo, s.params[s.algorithmId] ?? {}) : {}, seed: s.seed,
    paper: s.paper, profile: s.profile, penWidth: s.penWidth, strokeColor: s.strokeColor, paperColor: s.paperColor,
    optimize: s.optimize, clip: s.clip, plotLayers: s.plotLayers ?? sanitizePlotLayers(undefined),
  };
  if (includeImages && algo?.inputs && (images.photo || images.depth)) {
    p.images = {};
    if (algo.inputs.photo && images.photo) p.images.photo = embedImage(images.photo);
    if (algo.inputs.depth && images.depth) p.images.depth = embedImage(images.depth);
  }
  return p;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const finite = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const color = (x: unknown, d: string) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x : d);

/** Parse and validate a project file. Unknown or out-of-range values fall back to defaults; structural problems are errors. */
export function parseProject(text: string): { project: ProjectFile } | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: "This file isn't valid JSON." }; }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) return { error: "This isn't a Plot Lab project file." };
  if (typeof raw.version !== "number" || raw.version > PROJECT_VERSION) return { error: "This project was saved by a newer version of Plot Lab." };
  const algo = typeof raw.algorithmId === "string" ? getAlgorithm(raw.algorithmId) : undefined;
  if (!algo) return { error: `Unknown algorithm "${String(raw.algorithmId)}".` };
  const paperIn = isObj(raw.paper) ? raw.paper : {};
  const paper: PaperSettings = {
    paper: PAPER_NAMES.includes(paperIn.paper as never) ? (paperIn.paper as PaperSettings["paper"]) : DEFAULT_PAPER.paper,
    customWidth: finite(paperIn.customWidth, DEFAULT_PAPER.customWidth), customHeight: finite(paperIn.customHeight, DEFAULT_PAPER.customHeight),
    orientation: paperIn.orientation === "landscape" ? "landscape" : "portrait", margin: finite(paperIn.margin, DEFAULT_PAPER.margin),
  };
  const merge = <T extends object>(d: T, x: unknown): T => {
    const out = { ...d } as Record<string, unknown>;
    if (isObj(x)) for (const k of Object.keys(d)) if (typeof x[k] === typeof out[k]) out[k] = x[k];
    return out as T;
  };
  const project: ProjectFile = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 120) : "Untitled",
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
    algorithmId: algo.id, params: resolveParams(algo, isObj(raw.params) ? (raw.params as ParamValues) : {}),
    seed: Math.min(999_999, Math.max(1, Math.round(finite(raw.seed, 1)))), paper,
    profile: merge(DEFAULT_PROFILE, raw.profile), penWidth: Math.min(2, Math.max(0.05, finite(raw.penWidth, 0.3))),
    strokeColor: color(raw.strokeColor, "#000000"), paperColor: color(raw.paperColor, "#ffffff"),
    optimize: merge(DEFAULT_OPTIMIZE, raw.optimize), clip: merge(DEFAULT_CLIP, raw.clip), plotLayers: sanitizePlotLayers(raw.plotLayers),
  };
  if (isObj(raw.images)) {
    project.images = {};
    for (const k of ["photo", "depth"] as const) {
      const e = raw.images[k];
      if (isObj(e) && typeof e.png === "string") project.images[k] = { name: String(e.name ?? k), bits: finite(e.bits, 8), png: e.png };
    }
  }
  return { project };
}

export const projectFilename = (p: Pick<ProjectFile, "name">) => `${p.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "project"}.plotlab.json`;
