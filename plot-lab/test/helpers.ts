import type { GeometryCollection, PlotPath } from "../src/geometry/types";
import { DEFAULT_LAYER } from "../src/geometry/types";

export const path = (pts: [number, number][], closed = false, layerId = "ink", id = "t"): PlotPath =>
  ({ id, points: pts.map(([x, y]) => ({ x, y })), closed, layerId });

export const collection = (paths: PlotPath[], w = 210, h = 297): GeometryCollection =>
  ({ widthMm: w, heightMm: h, layers: [DEFAULT_LAYER], paths });
