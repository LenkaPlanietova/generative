/**
 * Phase 1 — Flow Field. Noise direction field + constant/radial density, drawn with the streamline engine.
 * Every parameter is in mm or degrees; the grid resolution only changes precision, not the drawing.
 */
import type { DirectionField, Grid, ScalarField } from "../core/fields";
import { type Path, gridToMm } from "../core/path";
import { type PaperSettings, type Sheet, sheetFor } from "../core/paper";
import { constantScalar } from "../fields/constant";
import { noiseHeight } from "../fields/noise";
import { radialGradient } from "../fields/radial";
import { type DirectionOptions, directionFromHeight } from "../fields/structureTensor";
import { type StreamlineParams, traceStreamlines } from "../engine/streamlines";
import { rdp } from "../engine/simplify";
import { type PlotSpeeds, type PlotStats, orderPaths, penUpTravel, plotStats } from "../engine/order";

export interface FlowFieldParams extends PaperSettings, StreamlineParams, Omit<DirectionOptions, "seed">, PlotSpeeds {
  /** Pen width, mm — preview stroke, SVG stroke and the spacing warning. */
  penWidth: number;
  /** Noise feature size, mm. */
  noiseSize: number;
  noiseOctaves: number;
  density: "constant" | "radial";
  /** Tone for constant density (0 = black/dense, 1 = white/sparse). */
  constantTone: number;
  radialCentreTone: number;
  radialEdgeTone: number;
  /** mm */
  radialRadius: number;
  /** Grid cells along the drawing area's long side. */
  resolution: number;
  /** RDP tolerance, mm. */
  simplify: number;
  optimise: boolean;
}

export const FLOW_FIELD_DEFAULTS: FlowFieldParams = {
  paper: "A4", customWidth: 200, customHeight: 200, orientation: "portrait", margin: 20,
  penWidth: 0.3,
  darkestSpacing: 0.6, lightestSpacing: 3, gamma: 1, clearance: 0.5,
  minLength: 4, maxLength: 600, maxTurn: 35, stepSize: 0.35,
  seedOrder: "dark", whiteCut: 1, seed: 7,
  noiseSize: 60, noiseOctaves: 2,
  detail: 2, swirlSize: 15, swirlStrength: 0.6, offset: 0, wobble: 0, wobbleSize: 20,
  density: "radial", constantTone: 0.5, radialCentreTone: 0, radialEdgeTone: 1, radialRadius: 110,
  resolution: 800, simplify: 0.06, optimise: true,
  drawSpeed: 30, travelSpeed: 75, penLift: 0.35,
};

export interface FlowFieldLayout {
  sheet: Sheet;
  grid: Grid;
  /** Grid origin on the sheet, mm. */
  ox: number;
  oy: number;
}

export function layoutFor(p: FlowFieldParams): FlowFieldLayout {
  const sheet = sheetFor(p), a = sheet.area;
  const mmPerPx = Math.max(a.width, a.height) / Math.max(50, p.resolution);
  const grid: Grid = { width: Math.max(8, Math.round(a.width / mmPerPx)), height: Math.max(8, Math.round(a.height / mmPerPx)), mmPerPx };
  return { sheet, grid, ox: a.x, oy: a.y };
}

export function buildFields(p: FlowFieldParams, grid: Grid): { direction: DirectionField; tone: ScalarField } {
  const height = noiseHeight(grid, { size: p.noiseSize, octaves: p.noiseOctaves, seed: p.seed });
  const direction = directionFromHeight(height, grid, p);
  const tone = p.density === "radial"
    ? radialGradient(grid, { centreTone: p.radialCentreTone, edgeTone: p.radialEdgeTone, radius: p.radialRadius })
    : constantScalar(grid, p.constantTone);
  return { direction, tone };
}

export interface FlowFieldResult {
  layout: FlowFieldLayout;
  /** Final plot order, sheet mm. */
  paths: Path[];
  before: PlotStats;
  after: PlotStats;
}

export function runFlowField(
  p: FlowFieldParams,
  hooks: { onFields?: (f: { direction: DirectionField; tone: ScalarField }, layout: FlowFieldLayout) => void; onBatch?: (mm: Path[], progress: number) => void } = {},
): FlowFieldResult {
  const layout = layoutFor(p), { grid, ox, oy } = layout;
  const fields = buildFields(p, grid);
  hooks.onFields?.(fields, layout);
  const { lines } = traceStreamlines({
    ...fields,
    mmPerPx: grid.mmPerPx,
    params: p,
    onBatch: hooks.onBatch && ((b, f) => hooks.onBatch!(gridToMm(b, grid.mmPerPx, ox, oy), f)),
  });
  const simple = gridToMm(lines.map((L) => rdp(L, p.simplify / grid.mmPerPx)), grid.mmPerPx, ox, oy);
  const before = plotStats(simple, p, penUpTravel(simple));
  const paths = p.optimise ? orderPaths(simple).lines : simple;
  return { layout, paths, before, after: plotStats(paths, p, penUpTravel(paths)) };
}

/** SPEC_ADDENDUM §F */
export function penWarning(p: Pick<FlowFieldParams, "darkestSpacing" | "penWidth">): string | null {
  return p.darkestSpacing < 1.2 * p.penWidth
    ? `Darkest spacing ${p.darkestSpacing} mm is under 1.2 × pen width (${(1.2 * p.penWidth).toFixed(2)} mm) — these areas will plot as solid black.`
    : null;
}
