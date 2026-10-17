/**
 * Export validation — runs before every export and blocks it on errors.
 * Catches the failure modes of plotter SVGs: empty or invisible output, wrong dimensions, non-finite or
 * out-of-area coordinates, broken path data, raster/CSS/clip content, and ink so dense it plots solid black.
 */
import type { Sheet } from "../core/paper";
import { polylineLength } from "../geometry/convert";
import type { GeometryCollection } from "../geometry/types";
import { inkDensity } from "../plotter/density";
import type { PlotterProfile } from "../plotter/profiles";
import { type PlotStats, travelMoves } from "../plotter/stats";
import type { ExportSettings } from "./svg";

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
}

const err = (code: string, message: string): Issue => ({ level: "error", code, message });
const warn = (code: string, message: string): Issue => ({ level: "warning", code, message });

/** Relative luminance of a #rgb / #rrggbb colour, or null if it isn't one. */
export function luminance(color: string): number | null {
  let m = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  const short = /^#([0-9a-f]{3})$/i.exec(color)?.[1];
  if (!m && short) m = short.split("").map((c) => c + c).join("");
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function penWarning(minSpacing: number, penWidth: number): Issue | null {
  return minSpacing < 1.2 * penWidth
    ? warn("PEN_SPACING", `Darkest spacing ${minSpacing} mm is under 1.2 × pen width (${(1.2 * penWidth).toFixed(2)} mm): those areas will plot as solid black.`)
    : null;
}

export function validateGeometry(g: GeometryCollection, sheet: Sheet, s: ExportSettings, layerStroke = (id: string) => g.layers.find((l) => l.id === id)?.stroke): Issue[] {
  const issues: Issue[] = [];
  // Physical dimensions
  if (!Number.isFinite(g.widthMm) || !Number.isFinite(g.heightMm) || g.widthMm < 10 || g.heightMm < 10 || g.widthMm > 2000 || g.heightMm > 2000)
    issues.push(err("DIMENSIONS", `Sheet size ${g.widthMm} × ${g.heightMm} mm is not a valid paper size (10–2000 mm).`));
  else if (Math.abs(g.widthMm - sheet.width) > 0.01 || Math.abs(g.heightMm - sheet.height) > 0.01)
    issues.push(err("DIMENSIONS", `Geometry is ${g.widthMm} × ${g.heightMm} mm but the paper is ${sheet.width} × ${sheet.height} mm. Regenerate first.`));

  // Geometry exists, coordinates finite and inside the drawing area
  let drawable = 0, ink = 0, nonFinite = 0, outside = 0;
  const a = sheet.area, tol = 0.01;
  for (const p of g.paths) {
    let ok = p.points.length >= 2;
    for (const q of p.points) {
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) { nonFinite++; ok = false; continue; }
      if (q.x < a.x - tol || q.y < a.y - tol || q.x > a.x + a.width + tol || q.y > a.y + a.height + tol) outside++;
    }
    if (ok) { drawable++; ink += polylineLength(p.points, p.closed); }
  }
  if (nonFinite) issues.push(err("NON_FINITE", `${nonFinite} point(s) have non-finite coordinates.`));
  if (drawable === 0 || ink <= 0) issues.push(err("EMPTY", "There is no visible geometry to export."));
  if (outside) issues.push(err("OUT_OF_AREA", `${outside} point(s) fall outside the drawing area (inside the margins).`));

  // Stroke
  if (!Number.isFinite(s.strokeWidth) || s.strokeWidth < 0.05 || s.strokeWidth > 5)
    issues.push(err("STROKE_WIDTH", `Stroke width ${s.strokeWidth} mm must be between 0.05 and 5 mm.`));
  const colors = new Set(s.stroke ? [s.stroke] : g.layers.filter((l) => g.paths.some((p) => p.layerId === l.id)).map((l) => layerStroke(l.id) ?? ""));
  for (const c of colors) {
    const L = luminance(c);
    if (L === null) issues.push(err("STROKE_COLOR", `Stroke colour "${c}" is not a #rrggbb colour.`));
    else if (L > 0.85) issues.push(err("STROKE_INVISIBLE", `Stroke colour ${c} is too light to see on white paper.`));
  }
  return issues;
}

/** Pen-up moves shorter than this (mm) are flagged: the lift costs a full pen-lift delay for almost no travel. */
export const SHORT_TRAVEL = 0.5;
const count = (n: number) => n.toLocaleString("en-US");

/** Warnings about how the drawing will plot. */
export function plotWarnings(g: GeometryCollection, stats: PlotStats, penWidth: number, profile: PlotterProfile, sheet: Sheet): Issue[] {
  const issues: Issue[] = [];
  const d = inkDensity(g, penWidth);
  if (d.saturated > 0.05)
    issues.push(warn("DENSITY", `${Math.round(d.saturated * 100)} % of the inked area is covered solid by overlapping lines at ${penWidth} mm pen width.`));
  if (stats.time > 4 * 3600) issues.push(warn("LONG_PLOT", `Estimated plotting time is ${(stats.time / 3600).toFixed(1)} h.`));
  if (stats.penLifts > 5000) issues.push(warn("PEN_LIFTS", `${count(stats.penLifts)} pen lifts.`));
  const short = g.paths.filter((p) => polylineLength(p.points, p.closed) < 1).length;
  if (short > Math.max(20, 0.1 * g.paths.length)) issues.push(warn("SHORT_PATHS", `${short} paths are shorter than 1 mm.`));
  const hops = travelMoves(g).filter((d) => d < SHORT_TRAVEL).length;
  if (hops > Math.max(20, 0.05 * stats.penLifts))
    issues.push(warn("SHORT_TRAVEL", `${count(hops)} pen-up moves are shorter than ${SHORT_TRAVEL} mm — the pen lifts and drops almost in place (about ${Math.max(1, Math.round((hops * profile.penLiftDelay * (profile.timeFactor || 1)) / 60))} min of lifting, and a risk of dots). Set Plotter optimisation → "Join gaps under" to draw across them.`));
  if (profile.maxWidth > 0 && profile.maxHeight > 0) {
    const fits = (sheet.area.width <= profile.maxWidth && sheet.area.height <= profile.maxHeight) || (sheet.area.width <= profile.maxHeight && sheet.area.height <= profile.maxWidth);
    if (!fits) issues.push(warn("PLOTTER_AREA", `Drawing area ${sheet.area.width} × ${sheet.area.height} mm is larger than ${profile.name}'s ${profile.maxWidth} × ${profile.maxHeight} mm.`));
  }
  return issues;
}

/** Checks the exported text itself, so a bug in the exporter can't ship a broken file. */
export function validateSvgText(svg: string, sheet: Pick<Sheet, "width" | "height">): Issue[] {
  const issues: Issue[] = [];
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root) return [err("SVG_ROOT", "No <svg> element.")];
  const attr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(root)?.[1];
  if (attr("width") !== `${sheet.width}mm` || attr("height") !== `${sheet.height}mm`)
    issues.push(err("SVG_SIZE", `SVG size ${attr("width")} × ${attr("height")} should be ${sheet.width}mm × ${sheet.height}mm.`));
  if (attr("viewBox") !== `0 0 ${sheet.width} ${sheet.height}`) issues.push(err("SVG_VIEWBOX", `viewBox "${attr("viewBox")}" should be "0 0 ${sheet.width} ${sheet.height}".`));
  const ds = [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
  if (!ds.length) issues.push(err("SVG_EMPTY", "The SVG contains no paths."));
  const pathData = /^M-?\d+(\.\d+)?,-?\d+(\.\d+)?(L-?\d+(\.\d+)?,-?\d+(\.\d+)?)+Z?$/;
  const bad = ds.filter((d) => !pathData.test(d)).length;
  if (bad) issues.push(err("SVG_PATH_DATA", `${bad} path(s) have malformed path data.`));
  if (/<image\b|<foreignObject\b|<filter\b|<clipPath\b|<mask\b|<style\b|\sstyle="|vector-effect|transform=/.test(svg))
    issues.push(err("SVG_UNSUPPORTED", "The SVG contains raster images, filters, clipping, CSS or transforms."));
  if (/\sfill="(?!none")/.test(svg)) issues.push(err("SVG_FILL", "The SVG contains filled shapes."));
  if (!/\sstroke="#[0-9a-fA-F]{3,6}"/.test(svg) || !/\sstroke-width="[\d.]+"/.test(svg)) issues.push(err("SVG_STROKE", "The SVG has no stroke colour or width."));
  return issues;
}
