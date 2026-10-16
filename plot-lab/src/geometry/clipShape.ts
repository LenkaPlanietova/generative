/**
 * Clip to shape (SPEC_ADDENDUM §E): paths are cut exactly where they cross a circle, ellipse or rectangle and the
 * unwanted pieces removed — real geometry, no SVG clipPath.
 */
import type { GeometryCollection, PlotPath, Point } from "./types";

/** The clip as the user sets it: centre as an offset from the drawing area's centre, so it follows paper changes. */
export interface ClipSettings {
  enabled: boolean;
  shape: "circle" | "ellipse" | "rectangle";
  /** mm from the drawing area's centre */
  offsetX: number;
  offsetY: number;
  /** mm (circle uses width as its diameter) */
  width: number;
  height: number;
  keep: "inside" | "outside";
  /** Add the shape's outline as its own layer. */
  outline: boolean;
}

export const DEFAULT_CLIP: ClipSettings = { enabled: false, shape: "circle", offsetX: 0, offsetY: 0, width: 140, height: 140, keep: "inside", outline: false };

/** A clip shape in absolute sheet coordinates. */
export interface ClipShape {
  shape: "circle" | "ellipse" | "rectangle";
  /** Centre, mm from the sheet's top-left. */
  cx: number;
  cy: number;
  /** mm (circle uses width as its diameter) */
  width: number;
  height: number;
  keep: "inside" | "outside";
}

/** Parameter interval [t0, t1] ⊂ [0, 1] of segment a→b that lies inside the shape, or null. */
function insideInterval(a: Point, b: Point, s: ClipShape): [number, number] | null {
  const rx = s.width / 2, ry = (s.shape === "circle" ? s.width : s.height) / 2;
  if (s.shape === "rectangle") {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy], q = [a.x - (s.cx - rx), s.cx + rx - a.x, a.y - (s.cy - ry), s.cy + ry - a.y];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t0 <= t1 ? [t0, t1] : null;
  }
  // Ellipse (circle = equal radii): scale to the unit circle and solve |a + t(b − a)|² = 1.
  const ax = (a.x - s.cx) / rx, ay = (a.y - s.cy) / ry, dx = (b.x - a.x) / rx, dy = (b.y - a.y) / ry;
  const A = dx * dx + dy * dy, B = 2 * (ax * dx + ay * dy), C = ax * ax + ay * ay - 1;
  if (A < 1e-18) return C <= 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const r = Math.sqrt(disc), t0 = Math.max(0, (-B - r) / (2 * A)), t1 = Math.min(1, (-B + r) / (2 * A));
  return t0 < t1 ? [t0, t1] : null;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Pieces of one polyline kept by the clip. */
export function clipToShape(points: Point[], closed: boolean, s: ClipShape): { points: Point[]; closed: boolean }[] {
  if (points.length < 2) return [];
  const pts = closed ? [...points, points[0]] : points, out: Point[][] = [];
  let cur: Point[] = [], allKept = true;
  const emit = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], iv = insideInterval(a, b, s);
    // Kept sub-intervals of this segment, in order.
    const keep: [number, number][] = s.keep === "inside" ? (iv ? [iv] : []) : !iv ? [[0, 1]] : ([[0, iv[0]], [iv[1], 1]] as [number, number][]).filter(([x, y]) => y - x > 1e-9);
    if (!(keep.length === 1 && keep[0][0] === 0 && keep[0][1] === 1)) allKept = false;
    for (const [t0, t1] of keep) {
      if (t0 > 0 || !cur.length) { emit(); cur.push(t0 > 0 ? lerp(a, b, t0) : a); }
      cur.push(t1 < 1 ? lerp(a, b, t1) : b);
      if (t1 < 1) emit();
    }
    if (!keep.length) emit();
  }
  emit();
  if (closed && allKept) return [{ points, closed: true }];
  // A closed path cut open: rejoin the piece through its start point.
  if (closed && out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if (first[0] === points[0] && last[last.length - 1] === points[0]) { out[0] = [...last, ...first.slice(1)]; out.pop(); }
  }
  return out.map((p) => ({ points: p, closed: false }));
}

/** The shape's outline as a polyline (0.5 mm segments). */
export function shapeOutline(s: ClipShape): Point[] {
  const rx = s.width / 2, ry = (s.shape === "circle" ? s.width : s.height) / 2;
  if (s.shape === "rectangle") return [{ x: s.cx - rx, y: s.cy - ry }, { x: s.cx + rx, y: s.cy - ry }, { x: s.cx + rx, y: s.cy + ry }, { x: s.cx - rx, y: s.cy + ry }];
  const n = Math.max(32, Math.ceil((Math.PI * (rx + ry)) / 0.5));
  return Array.from({ length: n }, (_, i) => ({ x: s.cx + rx * Math.cos((i / n) * 2 * Math.PI), y: s.cy + ry * Math.sin((i / n) * 2 * Math.PI) }));
}

export function absoluteClip(c: ClipSettings, area: { x: number; y: number; width: number; height: number }): ClipShape {
  return { shape: c.shape, cx: area.x + area.width / 2 + c.offsetX, cy: area.y + area.height / 2 + c.offsetY, width: c.width, height: c.height, keep: c.keep };
}

export function applyClip(g: GeometryCollection, c: ClipSettings, area: { x: number; y: number; width: number; height: number }): GeometryCollection {
  if (!c.enabled) return g;
  const s = absoluteClip(c, area), paths: PlotPath[] = [];
  for (const p of g.paths)
    clipToShape(p.points, p.closed, s).forEach((piece, i) => paths.push({ ...p, id: `${p.id}c${i}`, points: piece.points, closed: piece.closed }));
  const out = { ...g, paths };
  if (c.outline) {
    // The outline is clipped to the drawing area like everything else.
    const box: ClipShape = { shape: "rectangle", cx: area.x + area.width / 2, cy: area.y + area.height / 2, width: area.width, height: area.height, keep: "inside" };
    out.layers = [...g.layers, { id: "clip-outline", name: "clip outline", stroke: "#000000" }];
    clipToShape(shapeOutline(s), true, box).forEach((piece, i) => paths.push({ id: `outline${i}`, points: piece.points, closed: piece.closed, layerId: "clip-outline" }));
  }
  return out;
}
