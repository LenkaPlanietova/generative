/**
 * Shared geometry representation. Every coordinate is in millimetres on the sheet, origin top-left.
 * Algorithms return it; the preview, SVG exporter, optimiser and statistics all consume it.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PlotPath {
  id: string;
  points: Point[];
  closed: boolean;
  layerId: string;
  /** Plot Layers priming stroke: drawn in the priming strip (in the margin), not part of the artwork. */
  prime?: boolean;
}

export interface Layer {
  id: string;
  name: string;
  /** Stroke colour for preview and export. */
  stroke: string;
}

export interface GeometryCollection {
  widthMm: number;
  heightMm: number;
  layers: Layer[];
  paths: PlotPath[];
}

export const DEFAULT_LAYER: Layer = { id: "ink", name: "ink", stroke: "#000000" };
