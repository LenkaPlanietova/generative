/**
 * Plot Layers: split every row of the drawing by a hand-drawn mask into numbered layers — "1 object" (inside the
 * mask) and "2 background" (outside) — that AxiDraw Control plots one at a time from its Layers tab, so a POSCA plot
 * never has to pause (every pause/resume costs a few mm of registration on the EasyDraw).
 *
 * Per row: find where it crosses the mask edge, snap each cut to a flat stretch of the line (never mid-wave),
 * optionally stagger the cuts (feathered edge), merge fragments that are too short, apply the seam gap, orient each
 * piece (object →, background ends at the seam so the pen lifts off there) and simplify. Rows keep their
 * top-to-bottom order; nothing is reordered. Each layer starts with priming strokes in its own spot of the strip.
 */
import type { Sheet } from "../core/paper";
import { type Rng, rng } from "../core/rng";
import type { Issue } from "../export/validate";
import { bounds, polylineLength } from "../geometry/convert";
import { type MaskIndex, indexMask, insideMask, isValidMask, segmentCrossings } from "../geometry/mask";
import type { GeometryCollection, Layer, PlotPath, Point } from "../geometry/types";
import { rdpPoints } from "./optimize";

export type Region = "inside" | "outside";
export interface PlotLayerDef { region: Region; name: string }
export interface Rect { x: number; y: number; width: number; height: number }

export interface PrimeSettings {
  enabled: boolean;
  /** Centre the strip in the bottom margin; otherwise x, y, width and height (sheet mm) are used. */
  auto: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zigzags: number;
  dabs: number;
}

export interface PlotLayerSettings {
  enabled: boolean;
  /** Closed polygon, sheet mm. */
  mask: Point[];
  /** Plot order: one "inside" and one "outside" layer. */
  layers: PlotLayerDef[];
  flatThresholdMm: number;
  snapSearchMm: number;
  edgeMode: "crisp" | "feathered";
  staggerMm: number;
  seamGapMm: number;
  minSegmentMm: number;
  simplifyToleranceMm: number;
  /** Line one pump of the marker draws, mm; 0 = not measured yet (no budget). */
  inkPerPumpMm: number;
  inkSafety: number;
  /** Split a layer that is over budget into parts, at row boundaries only. */
  autoSplit: boolean;
  prime: PrimeSettings;
}

export const DEFAULT_PLOT_LAYERS: PlotLayerSettings = {
  enabled: false, mask: [], layers: [{ region: "inside", name: "object" }, { region: "outside", name: "background" }],
  flatThresholdMm: 0.08, snapSearchMm: 4, edgeMode: "crisp", staggerMm: 3, seamGapMm: 0, minSegmentMm: 1.5, simplifyToleranceMm: 0.05,
  inkPerPumpMm: 0, inkSafety: 0.65, autoSplit: false,
  prime: { enabled: true, auto: true, x: 20, y: 280, width: 120, height: 6, zigzags: 3, dabs: 10 },
};

/** A cut is flat when the line stays this close to its baseline over this window around it, mm. */
export const FLAT_WINDOW_MM = 1;
/** Long segments are subdivided to this length first, so cuts can land anywhere along them. */
const DENSIFY_MM = 0.25;
/** Moving a cut inwards (into the object) counts this many times its distance; outwards counts once. */
const INWARD_COST = 3;
/** A row whose 6 mm moving average strays further than this from its best-fit line is treated as curved. */
const CURVED_MM = 1.5;
const PALETTE = ["#d9480f", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599"];

// ── Row analysis ────────────────────────────────────────────────────────────────────────────────────────────────

export function densify(points: Point[], max = DENSIFY_MM): Point[] {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / max);
    for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    out.push(b);
  }
  return out;
}

/** "Left to right": rows run towards +x; vertical rows run downwards. */
export function forwards(points: Point[]): boolean {
  const a = points[0], b = points[points.length - 1], dx = b.x - a.x;
  return dx > 1e-9 || (Math.abs(dx) <= 1e-9 && b.y >= a.y);
}

export function arcLengths(pts: Point[]): number[] {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return s;
}

/**
 * Each point's position along the row's baseline (`u`, mm) and signed distance from it (`dev`). The baseline is the
 * row's best-fit line, or — when the row itself curves (imported drawings, spirals) — its 6 mm moving average.
 * Snapping, stagger and the flat window are measured along the baseline: in dark areas the wiggly line itself is
 * several times longer than the row.
 */
export function baseline(pts: Point[], s: number[]): { u: Float64Array; dev: Float64Array } {
  const n = pts.length, dev = new Float64Array(n), u = new Float64Array(n);
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ex = Math.cos(th), ey = Math.sin(th);
  // 6 mm moving average (two pointers over the arc length).
  const mx = new Float64Array(n), my = new Float64Array(n);
  let lo = 0, hi = -1, sumX = 0, sumY = 0, curved = false;
  for (let i = 0; i < n; i++) {
    while (hi + 1 < n && s[hi + 1] <= s[i] + 3) { hi++; sumX += pts[hi].x; sumY += pts[hi].y; }
    while (s[lo] < s[i] - 3) { sumX -= pts[lo].x; sumY -= pts[lo].y; lo++; }
    mx[i] = sumX / (hi - lo + 1); my[i] = sumY / (hi - lo + 1);
    if (Math.abs((my[i] - cy) * ex - (mx[i] - cx) * ey) > CURVED_MM) curved = true;
  }
  if (!curved) {
    const dir = (pts[n - 1].x - pts[0].x) * ex + (pts[n - 1].y - pts[0].y) * ey >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      u[i] = dir * ((pts[i].x - cx) * ex + (pts[i].y - cy) * ey);
      dev[i] = (pts[i].y - cy) * ex - (pts[i].x - cx) * ey;
      if (i && u[i] < u[i - 1]) curved = true; // the row doubles back: not a straight row after all
    }
  }
  if (curved) {
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), tx = mx[b] - mx[a], ty = my[b] - my[a], l = Math.hypot(tx, ty) || 1;
      u[i] = i ? u[i - 1] + Math.hypot(mx[i] - mx[i - 1], my[i] - my[i - 1]) : 0;
      dev[i] = (tx * (pts[i].y - my[i]) - ty * (pts[i].x - mx[i])) / l;
    }
  }
  return { u, dev };
}

/** Largest |deviation| within ±window/2 (along the baseline) of each point. */
export function flatness(dev: Float64Array, u: ArrayLike<number>, window = FLAT_WINDOW_MM): Float64Array {
  const n = dev.length, out = new Float64Array(n), h = window / 2;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (u[lo] < u[i] - h) lo++;
    let m = 0;
    for (let j = lo; j < n && u[j] <= u[i] + h; j++) m = Math.max(m, Math.abs(dev[j]));
    out[i] = m;
  }
  return out;
}

export interface Cut {
  /** Arc length along the (densified, left-to-right) row, mm. */
  s: number;
  point: Point;
  /** No flat point within reach: cut at the nearest wave extremum or zero crossing instead. */
  flagged: boolean;
}

export interface RowPiece {
  region: Region;
  /** In drawing order. */
  points: Point[];
  /** Arc-length interval of the row it covers (s0 < s1, left to right). */
  s0: number;
  s1: number;
  /** Starts / ends at a cut (the mask edge) rather than at the row's own end. */
  cutStart: boolean;
  cutEnd: boolean;
  /** Drawn right to left. */
  reversed: boolean;
}

export interface RowSplit {
  /** The row as analysed: densified and left to right. */
  points: Point[];
  length: number;
  cuts: Cut[];
  pieces: RowPiece[];
}

export type SplitOptions = Pick<PlotLayerSettings, "flatThresholdMm" | "snapSearchMm" | "edgeMode" | "staggerMm" | "seamGapMm" | "minSegmentMm" | "simplifyToleranceMm">;

const lowerBound = (s: ArrayLike<number>, v: number) => {
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
  return lo;
};

function pointAt(pts: Point[], s: number[], v: number): Point {
  const i = Math.min(pts.length - 2, Math.max(0, lowerBound(s, v) - 1)), d = s[i + 1] - s[i], t = d > 0 ? Math.min(1, Math.max(0, (v - s[i]) / d)) : 0;
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
}

function subPolyline(pts: Point[], s: number[], s0: number, s1: number): Point[] {
  const out = [pointAt(pts, s, s0)];
  for (let i = lowerBound(s, s0); i < pts.length && s[i] < s1; i++) if (s[i] > s0) out.push(pts[i]);
  out.push(pointAt(pts, s, s1));
  return out;
}

const flip = (r: Region): Region => (r === "inside" ? "outside" : "inside");

/** Split one row by the mask. `rand` is consumed once per mask crossing in feathered mode. */
export function splitRow(input: Point[], closed: boolean, mask: MaskIndex, o: SplitOptions, rand: Rng): RowSplit {
  let pts = densify(closed ? [...input, input[0]] : input);
  if (!forwards(pts)) pts = pts.reverse();
  const n = pts.length, s = arcLengths(pts), L = s[n - 1];
  const { u, dev } = baseline(pts, s), flat = flatness(dev, u);
  const inside = pts.map((p) => insideMask(mask, p));

  // Where the row crosses the mask edge.
  const crossings: { u: number; toInside: boolean }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    if (inside[i] === inside[i + 1]) continue;
    const ts = segmentCrossings(mask, pts[i], pts[i + 1]), t = ts.length ? ts[(ts.length - 1) >> 1] : 0.5;
    crossings.push({ u: u[i] + t * (u[i + 1] - u[i]), toInside: inside[i + 1] });
  }

  // Snap each crossing to the cheapest flat vertex in reach (along the baseline); outwards — into the background —
  // is preferred.
  const snap = o.snapSearchMm;
  let cuts: Cut[] = crossings.map((c) => {
    const out = c.toInside ? -1 : 1, offset = o.edgeMode === "feathered" ? rand() * o.staggerMm : 0;
    // Flat right at the edge (or the staggered target): cut exactly there.
    const target = c.u + out * offset, k = Math.min(n - 2, Math.max(0, lowerBound(u, target) - 1));
    if (u[k] <= target && target <= u[k + 1] && flat[k] <= o.flatThresholdMm && flat[k + 1] <= o.flatThresholdMm) {
      const sv = s[k] + (u[k + 1] > u[k] ? (target - u[k]) / (u[k + 1] - u[k]) : 0) * (s[k + 1] - s[k]);
      return { s: sv, point: pointAt(pts, s, sv), flagged: false };
    }
    // Otherwise the cheapest flat vertex in reach.
    const j0 = lowerBound(u, c.u - snap - offset), j1 = lowerBound(u, c.u + snap + offset + 1e-9);
    const cost = (j: number, off: number) => {
      const r = (u[j] - c.u) * out;
      return r < -snap || r > snap + off ? Infinity : Math.abs(r - off) * (r < 0 ? INWARD_COST : 1);
    };
    let best = -1, bc = Infinity;
    for (let j = j0; j < j1; j++) if (flat[j] <= o.flatThresholdMm) { const k = cost(j, offset); if (k < bc) { bc = k; best = j; } }
    if (best >= 0) return { s: s[best], point: pts[best], flagged: false };
    // No flat point: the nearest wave extremum or zero crossing, flagged for the preview.
    for (let j = Math.max(1, j0); j < Math.min(n - 1, j1); j++) {
      const d0 = dev[j - 1], d1 = dev[j], d2 = dev[j + 1];
      const zero = d1 === 0 || (Math.sign(d1) !== Math.sign(d2) && Math.abs(d1) <= Math.abs(d2)), extremum = (d1 - d0) * (d2 - d1) < 0;
      if (zero || extremum) { const k = cost(j, 0); if (k < bc) { bc = k; best = j; } }
    }
    if (best < 0) best = Math.min(n - 1, lowerBound(u, c.u));
    return { s: s[best], point: pts[best], flagged: true };
  });

  // Drop cuts that landed on the row's ends, and pairs of cuts that met or crossed (the piece between vanishes).
  let start: Region = inside[0] ? "inside" : "outside";
  for (let changed = true; changed;) {
    changed = false;
    if (cuts.length && cuts[0].s <= 1e-6) { cuts.shift(); start = flip(start); changed = true; continue; }
    if (cuts.length && cuts[cuts.length - 1].s >= L - 1e-6) { cuts.pop(); changed = true; continue; }
    for (let k = 0; k + 1 < cuts.length; k++) if (cuts[k + 1].s - cuts[k].s <= 1e-6) { cuts.splice(k, 2); changed = true; break; }
  }
  // Merge pieces shorter than the minimum into their neighbours, shortest first.
  const edges = () => [0, ...cuts.map((c) => c.s), L];
  while (cuts.length) {
    const e = edges();
    let k = 0;
    for (let i = 1; i + 1 < e.length; i++) if (e[i + 1] - e[i] < e[k + 1] - e[k]) k = i;
    if (e[k + 1] - e[k] >= o.minSegmentMm) break;
    if (k === 0) { cuts.shift(); start = flip(start); } else if (k === cuts.length) cuts.pop(); else cuts.splice(k - 1, 2);
  }

  const e = edges(), pieces: RowPiece[] = [];
  let region = start;
  for (let k = 0; k + 1 < e.length; k++, region = flip(region)) {
    let s0 = e[k], s1 = e[k + 1];
    const cutStart = k > 0, cutEnd = k + 1 < e.length - 1;
    // Seam gap: only the background side moves, so the object's rows stay whole.
    if (region === "outside") { if (cutStart) s0 += o.seamGapMm; if (cutEnd) s1 -= o.seamGapMm; }
    s0 = Math.max(0, s0); s1 = Math.min(L, s1);
    if (s1 - s0 <= 1e-6) continue;
    // Object pieces run left to right; a background piece that only touches the mask at its start runs right to
    // left, so every background piece that touches the mask ends there and the pen lifts off at the seam.
    const reversed = region === "outside" && cutStart && !cutEnd;
    let piece = subPolyline(pts, s, s0, s1);
    if (o.simplifyToleranceMm > 0) piece = rdpPoints(piece, o.simplifyToleranceMm);
    if (reversed) piece.reverse();
    pieces.push({ region, points: piece, s0, s1, cutStart, cutEnd, reversed });
  }
  return { points: pts, length: L, cuts, pieces };
}

// ── Priming strip ───────────────────────────────────────────────────────────────────────────────────────────────

/** Default strip: centred in the bottom margin, up to 6 mm tall and 160 mm long; null when the margin is too small. */
export function autoPrimeArea(sheet: Sheet): Rect | null {
  const a = sheet.area, m = sheet.height - (a.y + a.height), h = Math.min(6, m - 4);
  if (h < 2) return null;
  return { x: a.x, y: a.y + a.height + (m - h) / 2, width: Math.min(a.width, 160), height: h };
}

export const primeArea = (o: PrimeSettings, sheet: Sheet): Rect | null =>
  !o.enabled ? null : o.auto ? autoPrimeArea(sheet) : { x: o.x, y: o.y, width: o.width, height: o.height };

const ZIG_MM = 3;

/** Length of one layer's spot along the strip, mm. */
export function primeSpotLength(o: PrimeSettings, penWidth: number): number {
  const pitch = Math.max(1, 1.5 * penWidth);
  return o.zigzags * (ZIG_MM + pitch) + o.dabs * pitch;
}

/**
 * Priming strokes for each layer, each in a fresh spot along the strip: `zigzags` short zigzags, then `dabs` 0.3 mm
 * dabs (pen down/up pumping). Returns null when the strip is too short for every layer.
 */
export function primeSpots(area: Rect, o: PrimeSettings, count: number, penWidth: number): { spot: Rect; paths: Point[][] }[] | null {
  const along = area.width >= area.height, long = along ? area.width : area.height, short = along ? area.height : area.width;
  const pitch = Math.max(1, 1.5 * penWidth), inset = penWidth / 2, len = primeSpotLength(o, penWidth), gap = 2 + penWidth;
  if (count * len + (count - 1) * gap + 2 * inset > long || short < 2 * inset + 0.5) return null;
  const map = (u: number, v: number): Point => (along ? { x: area.x + u, y: area.y + v } : { x: area.x + v, y: area.y + u });
  const out = [];
  for (let k = 0; k < count; k++) {
    const u0 = inset + k * (len + gap), paths: Point[][] = [];
    for (let i = 0; i < o.zigzags; i++) {
      const u = u0 + i * (ZIG_MM + pitch), lo = inset, hi = short - inset;
      paths.push([map(u, lo), map(u + ZIG_MM / 3, hi), map(u + (2 * ZIG_MM) / 3, lo), map(u + ZIG_MM, hi)]);
    }
    for (let j = 0; j < o.dabs; j++) {
      const u = u0 + o.zigzags * (ZIG_MM + pitch) + (j + 0.5) * pitch;
      paths.push([map(u, short / 2 - 0.15), map(u, short / 2 + 0.15)]);
    }
    const a = map(u0 - inset, 0), b = map(u0 + len, short);
    out.push({ spot: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, paths });
  }
  return out;
}

// ── The whole drawing ───────────────────────────────────────────────────────────────────────────────────────────

export interface PlotLayerInfo {
  id: string;
  /** AxiDraw layer number (the label starts with it). */
  number: number;
  name: string;
  region: Region;
  part: number;
  parts: number;
  /** Artwork ink, mm (pen down, priming excluded). */
  inkMm: number;
  primeInkMm: number;
  rows: number;
  paths: number;
  overBudget: boolean;
  spot: Rect | null;
}

export interface Seam { x: number; y: number; flagged: boolean }

export interface PlotLayerReport {
  layers: PlotLayerInfo[];
  seams: Seam[];
  cuts: number;
  flagged: number;
  /** One pump × safety, mm; 0 = not measured. */
  budgetMm: number;
  primeArea: Rect | null;
  mask: Point[];
  issues: Issue[];
}

const err = (code: string, message: string): Issue => ({ level: "error", code, message });
const warn = (code: string, message: string): Issue => ({ level: "warning", code, message });
const m = (mm: number) => `${(mm / 1000).toFixed(1)} m`;

/** Rectangles overlap (touching counts as apart). */
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export type PlotLayerRequest = PlotLayerSettings & { penWidth: number };

/**
 * Split the drawing into plot layers. `geometry` is null (and the report holds an error) when there is no usable
 * mask, so the caller can fall back to the normal pipeline.
 */
export function splitPlotLayers(g: GeometryCollection, o: PlotLayerRequest, seed: number, sheet: Sheet): { geometry: GeometryCollection | null; report: PlotLayerReport } {
  const budget = o.inkPerPumpMm > 0 ? o.inkPerPumpMm * o.inkSafety : 0;
  const report: PlotLayerReport = { layers: [], seams: [], cuts: 0, flagged: 0, budgetMm: budget, primeArea: null, mask: o.mask, issues: [] };
  if (!isValidMask(o.mask)) {
    report.issues.push(err("PLOT_LAYERS_MASK", "Plot layers is on but there is no mask yet. Draw one on the canvas or import it from an SVG layer named \"mask\"."));
    return { geometry: null, report };
  }
  const mask = indexMask(o.mask), rand = rng((seed * 2654435761) >>> 0 || 1);
  if (g.layers.filter((l) => g.paths.some((p) => p.layerId === l.id)).length > 1)
    report.issues.push(warn("PLOT_LAYERS_SOURCE", "This drawing has several layers; Plot layers splits them all together by the mask."));

  // Rows top to bottom (stable, so rows at the same height keep the generator's order).
  const rows = g.paths.filter((p) => p.points.length >= 2).map((p, i) => ({ p, i, y: p.points.reduce((a, q) => a + q.y, 0) / p.points.length }));
  rows.sort((a, b) => a.y - b.y || a.i - b.i);
  const byRegion: Record<Region, { row: number; points: Point[]; ink: number }[]> = { inside: [], outside: [] };
  rows.forEach(({ p }, r) => {
    const split = splitRow(p.points, p.closed, mask, o, rand);
    for (const c of split.cuts) report.seams.push({ x: c.point.x, y: c.point.y, flagged: c.flagged });
    for (const piece of split.pieces) byRegion[piece.region].push({ row: r, points: piece.points, ink: polylineLength(piece.points) });
  });
  report.cuts = report.seams.length;
  report.flagged = report.seams.filter((s) => s.flagged).length;
  if (report.flagged)
    report.issues.push(warn("FLAGGED_CUTS", `${report.flagged} of ${report.cuts} cuts found no flat stretch within ${o.snapSearchMm} mm and were cut at a wave peak or zero crossing (red dots in the preview). Raise "Snap search" or move the mask edge.`));

  // Layers in plot order; an over-budget layer is split into parts at row boundaries when asked.
  const chunks: { def: PlotLayerDef; part: number; parts: number; items: typeof byRegion.inside }[] = [];
  for (const def of o.layers) {
    const items = byRegion[def.region];
    if (!items.length) { report.issues.push(warn("PLOT_LAYERS_EMPTY", `Nothing falls ${def.region} the mask, so there is no "${def.name}" layer.`)); continue; }
    const groups: (typeof items)[] = [[]];
    let acc = 0;
    for (let k = 0; k < items.length;) {
      const row = items[k].row;
      let rowInk = 0, e = k;
      while (e < items.length && items[e].row === row) rowInk += items[e++].ink;
      if (o.autoSplit && budget > 0 && acc > 0 && acc + rowInk > budget) { groups.push([]); acc = 0; }
      groups[groups.length - 1].push(...items.slice(k, e));
      acc += rowInk;
      k = e;
    }
    groups.forEach((items, i) => chunks.push({ def, part: i + 1, parts: groups.length, items }));
  }

  // Priming spots, one per layer, outside the artwork and on the sheet.
  const art = bounds(chunks.flatMap((c) => c.items.map((it) => ({ id: "", points: it.points, closed: false, layerId: "" }))));
  const area = primeArea(o.prime, sheet);
  if (o.prime.enabled && !area) report.issues.push(err("PRIME_AREA", "The bottom margin is too small for the priming strip. Set the strip's position by hand, or turn priming off."));
  let spots: ReturnType<typeof primeSpots> = null;
  if (area) {
    report.primeArea = area;
    const pw = o.penWidth / 2;
    if (area.x < 0 || area.y < 0 || area.x + area.width > sheet.width || area.y + area.height > sheet.height)
      report.issues.push(err("PRIME_OFF_SHEET", "The priming strip must lie on the sheet: AxiDraw doesn't plot outside the page."));
    if (art && overlaps(area, { x: art.minX - pw, y: art.minY - pw, width: art.maxX - art.minX + 2 * pw, height: art.maxY - art.minY + 2 * pw }))
      report.issues.push(err("PRIME_OVERLAP", "The priming strip overlaps the artwork. Move it into the margin."));
    spots = primeSpots(area, o.prime, chunks.length, o.penWidth);
    if (!spots) report.issues.push(err("PRIME_FULL", `The priming strip is too short for ${chunks.length} layers: each needs ${(primeSpotLength(o.prime, o.penWidth) + 2 + o.penWidth).toFixed(0)} mm.`));
  }

  const layers: Layer[] = [], paths: PlotPath[] = [];
  chunks.forEach((c, k) => {
    const number = k + 1, id = `pl${number}`, name = c.parts > 1 ? `${c.def.name} ${c.part} of ${c.parts}` : c.def.name;
    layers.push({ id, name, stroke: PALETTE[k % PALETTE.length] });
    const spot = spots?.[k];
    let primeInk = 0;
    spot?.paths.forEach((pts, i) => { primeInk += polylineLength(pts); paths.push({ id: `${id}prime${i}`, points: pts, closed: false, layerId: id, prime: true }); });
    let ink = 0;
    c.items.forEach((it, i) => { ink += it.ink; paths.push({ id: `${id}r${it.row}p${i}`, points: it.points, closed: false, layerId: id }); });
    const info: PlotLayerInfo = {
      id, number, name, region: c.def.region, part: c.part, parts: c.parts, inkMm: ink, primeInkMm: primeInk,
      rows: new Set(c.items.map((it) => it.row)).size, paths: c.items.length, overBudget: budget > 0 && ink > budget, spot: spot?.spot ?? null,
    };
    report.layers.push(info);
    if (info.overBudget)
      report.issues.push(warn("INK_BUDGET", `Layer ${number} "${name}" draws ${m(ink)}, over one pump's safe budget of ${m(budget)}. ${o.autoSplit ? "A single row is longer than the budget." : "Turn on \"Split over-budget layers\", or draw a mask around part of it."}`));
  });
  return { geometry: { widthMm: g.widthMm, heightMm: g.heightMm, layers, paths }, report };
}

// ── Plot instructions ───────────────────────────────────────────────────────────────────────────────────────────

const fmtTime = (s: number) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

/** Step-by-step instructions for plotting the layers in AxiDraw Control. `time` gives a layer's estimated seconds. */
export function plotInstructions(r: PlotLayerReport, o: Pick<PlotLayerSettings, "inkPerPumpMm">, time?: (layerId: string) => number, dryMinutes = 10): string {
  const lines = [`Plot Layers: ${r.layers.length} layers. Plot them one at a time, in order, from AxiDraw Control's Layers tab.`, "", "Before you start"];
  if (r.primeArea) {
    const a = r.primeArea;
    lines.push(`- Tape a scrap strip over the priming area: x ${a.x.toFixed(1)}-${(a.x + a.width).toFixed(1)} mm, y ${a.y.toFixed(1)}-${(a.y + a.height).toFixed(1)} mm. Each layer primes the marker there first, in its own spot.`);
  }
  lines.push(
    "- In AxiDraw Control, turn path reordering off (Options), so rows plot in the file's order and keep their stroke directions.",
    "- Home the plotter once. Don't power off, re-home or move the paper between layers.",
    "",
  );
  r.layers.forEach((l, i) => {
    const pumps = o.inkPerPumpMm > 0 ? `, about ${(l.inkMm / o.inkPerPumpMm).toFixed(1)} pumps` : "";
    const t = time ? `, est. ${fmtTime(time(l.id))}` : "";
    lines.push(`${l.number}. Layers tab -> layer ${l.number} ("${l.name}") -> Plot. ${m(l.inkMm)} of ink${pumps}${t}.`);
    if (i + 1 < r.layers.length) lines.push(`   Then wait ${dryMinutes} min (POSCA drying) before layer ${r.layers[i + 1].number}.`);
  });
  lines.push("", "The %mask layer is a guide only; AxiDraw never plots layers whose name starts with %.");
  return lines.join("\n");
}

// ── Settings validation ─────────────────────────────────────────────────────────────────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const clamp = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const int = (x: unknown, lo: number, hi: number, d: number) => Math.round(clamp(x, lo, hi, d));
/** Layer names are free text after the number; a leading %, ! or + would change what AxiDraw does with the layer. */
export const cleanLayerName = (s: string) => s.replace(/[\u0000-\u001f]/g, "").replace(/^[\s%!+\d]+/, "").trim().slice(0, 40);

/** Stored or loaded settings → valid settings; anything missing or out of range falls back to the default. */
export function sanitizePlotLayers(x: unknown): PlotLayerSettings {
  const d = DEFAULT_PLOT_LAYERS;
  if (!isObj(x)) return { ...d, prime: { ...d.prime } };
  const mask = Array.isArray(x.mask) ? x.mask.filter((p): p is Point => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 5000).map((p) => ({ x: p.x, y: p.y })) : [];
  let layers = d.layers;
  if (Array.isArray(x.layers) && x.layers.length === 2) {
    const ls = x.layers.map((l) => (isObj(l) ? { region: l.region as Region, name: typeof l.name === "string" ? cleanLayerName(l.name) : "" } : null));
    if (ls.every((l) => l && l.name) && new Set(ls.map((l) => l!.region)).size === 2 && ls.every((l) => l!.region === "inside" || l!.region === "outside"))
      layers = ls as PlotLayerDef[];
  }
  const p = isObj(x.prime) ? x.prime : {};
  return {
    enabled: x.enabled === true, mask, layers: layers.map((l) => ({ ...l })),
    flatThresholdMm: clamp(x.flatThresholdMm, 0.005, 2, d.flatThresholdMm),
    snapSearchMm: clamp(x.snapSearchMm, 0, 30, d.snapSearchMm),
    edgeMode: x.edgeMode === "feathered" ? "feathered" : "crisp",
    staggerMm: clamp(x.staggerMm, 0, 30, d.staggerMm),
    seamGapMm: clamp(x.seamGapMm, -2, 2, d.seamGapMm),
    minSegmentMm: clamp(x.minSegmentMm, 0, 20, d.minSegmentMm),
    simplifyToleranceMm: clamp(x.simplifyToleranceMm, 0, 1, d.simplifyToleranceMm),
    inkPerPumpMm: clamp(x.inkPerPumpMm, 0, 1e7, d.inkPerPumpMm),
    inkSafety: clamp(x.inkSafety, 0.1, 1, d.inkSafety),
    autoSplit: x.autoSplit === true,
    prime: {
      enabled: p.enabled !== false, auto: p.auto !== false,
      x: clamp(p.x, -2000, 2000, d.prime.x), y: clamp(p.y, -2000, 2000, d.prime.y),
      width: clamp(p.width, 1, 2000, d.prime.width), height: clamp(p.height, 1, 2000, d.prime.height),
      zigzags: int(p.zigzags, 0, 20, d.prime.zigzags), dabs: int(p.dabs, 0, 100, d.prime.dabs),
    },
  };
}

/** The settings as written into the export's metadata comment: everything needed to reproduce the split. */
export function plotLayersMeta(o: PlotLayerRequest, seed: number) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { ...o, mask: o.mask.map((p) => [r(p.x), r(p.y)]), seed };
}
