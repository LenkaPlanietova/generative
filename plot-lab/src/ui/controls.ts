import { FLOW_FIELD_DEFAULTS, type FlowFieldParams } from "../algorithms/flowField";

type Key = keyof FlowFieldParams;
export type Control =
  | { id: Key; label: string; min: number; max: number; step: number; unit?: string; tip?: string; show?: (p: FlowFieldParams) => boolean; redraw?: boolean }
  | { id: Key; type: "select"; label: string; options: [string, string][]; tip?: string; show?: (p: FlowFieldParams) => boolean }
  | { id: Key; type: "check"; label: string; tip?: string };

export interface ControlGroup { group: string; open?: boolean; items: Control[] }

/** Settings that only change the preview/stats, not the geometry. */
export const DRAW_ONLY = new Set<Key>(["penWidth", "drawSpeed", "travelSpeed", "penLift"]);

export const CONTROLS: ControlGroup[] = [
  { group: "Paper & pen", open: true, items: [
    { id: "paper", type: "select", label: "Paper", options: [["A5", "A5 · 148 × 210"], ["A4", "A4 · 210 × 297"], ["A3", "A3 · 297 × 420"], ["A2", "A2 · 420 × 594"], ["Square", "Square · 200 × 200"], ["Custom", "Custom"]] },
    { id: "customWidth", label: "Width", min: 50, max: 1200, step: 1, unit: "mm", show: (p) => p.paper === "Custom" },
    { id: "customHeight", label: "Height", min: 50, max: 1200, step: 1, unit: "mm", show: (p) => p.paper === "Custom" },
    { id: "orientation", type: "select", label: "Orientation", options: [["portrait", "Portrait"], ["landscape", "Landscape"]] },
    { id: "margin", label: "Margin", min: 0, max: 80, step: 1, unit: "mm" },
    { id: "penWidth", label: "Pen width", min: 0.05, max: 1.5, step: 0.05, unit: "mm", tip: "Preview strokes are drawn at this width at real scale." },
  ] },
  { group: "Line spacing", open: true, items: [
    { id: "darkestSpacing", label: "Darkest spacing", min: 0.2, max: 5, step: 0.05, unit: "mm", tip: "Gap between lines where density is darkest. Keep above 1.2 × pen width." },
    { id: "lightestSpacing", label: "Lightest spacing", min: 0.5, max: 15, step: 0.1, unit: "mm" },
    { id: "gamma", label: "Gamma", min: 0.2, max: 3, step: 0.05, tip: "Below 1 pushes more lines into the mid-tones." },
    { id: "clearance", label: "Clearance", min: 0.2, max: 1, step: 0.01, unit: "×", tip: "A line stops when it gets closer than this × spacing to another line." },
    { id: "whiteCut", label: "White cut", min: 0.5, max: 1, step: 0.005, tip: "No lines where the tone is lighter than this. 1 = lines everywhere." },
  ] },
  { group: "Lines", items: [
    { id: "minLength", label: "Min line length", min: 0, max: 40, step: 0.5, unit: "mm" },
    { id: "maxLength", label: "Max line length", min: 10, max: 3000, step: 10, unit: "mm" },
    { id: "maxTurn", label: "Max turn per step", min: 5, max: 90, step: 1, unit: "°", tip: "Lines stop at sharp kinks such as swirl centres." },
    { id: "stepSize", label: "Step size", min: 0.1, max: 1, step: 0.05, unit: "×", tip: "Integration step relative to darkest spacing." },
    { id: "seedOrder", type: "select", label: "Seed order", options: [["dark", "Darkest first"], ["center", "Centre outwards"], ["random", "Random"]] },
    { id: "seed", label: "Seed", min: 1, max: 999, step: 1 },
  ] },
  { group: "Field", items: [
    { id: "noiseSize", label: "Noise size", min: 5, max: 400, step: 1, unit: "mm" },
    { id: "noiseOctaves", label: "Noise octaves", min: 1, max: 5, step: 1 },
    { id: "detail", label: "Detail smoothing", min: 0.2, max: 20, step: 0.1, unit: "mm", tip: "Lower = lines react to small features; higher = calmer curves." },
    { id: "swirlSize", label: "Swirl size", min: 1, max: 120, step: 1, unit: "mm" },
    { id: "swirlStrength", label: "Swirl strength", min: 0, max: 4, step: 0.05 },
    { id: "offset", label: "Direction offset", min: -90, max: 90, step: 1, unit: "°", tip: "0° = along contours, 90° = down slopes." },
    { id: "wobble", label: "Wobble amount", min: 0, max: 90, step: 1, unit: "°" },
    { id: "wobbleSize", label: "Wobble size", min: 2, max: 200, step: 1, unit: "mm" },
  ] },
  { group: "Density", items: [
    { id: "density", type: "select", label: "Density", options: [["radial", "Radial gradient"], ["constant", "Constant"]] },
    { id: "constantTone", label: "Tone", min: 0, max: 1, step: 0.01, show: (p) => p.density === "constant" },
    { id: "radialCentreTone", label: "Centre tone", min: 0, max: 1, step: 0.01, show: (p) => p.density === "radial" },
    { id: "radialEdgeTone", label: "Edge tone", min: 0, max: 1, step: 0.01, show: (p) => p.density === "radial" },
    { id: "radialRadius", label: "Radius", min: 5, max: 600, step: 1, unit: "mm", show: (p) => p.density === "radial" },
  ] },
  { group: "Quality & plot", items: [
    { id: "resolution", label: "Grid resolution", min: 200, max: 1600, step: 50, unit: "px", tip: "Calculation grid along the long side. Changes precision, not the drawing." },
    { id: "simplify", label: "Simplify", min: 0, max: 0.3, step: 0.01, unit: "mm" },
    { id: "optimise", type: "check", label: "Optimise pen path" },
    { id: "drawSpeed", label: "Draw speed", min: 5, max: 150, step: 1, unit: "mm/s" },
    { id: "travelSpeed", label: "Travel speed", min: 5, max: 300, step: 1, unit: "mm/s" },
    { id: "penLift", label: "Pen lift", min: 0, max: 2, step: 0.05, unit: "s" },
  ] },
];

export const DEFAULTS = FLOW_FIELD_DEFAULTS;
