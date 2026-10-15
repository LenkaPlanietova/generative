import type { GeometryCollection } from "../geometry/types";

export interface ExportSettings {
  /** mm */
  strokeWidth: number;
  /** Overrides every layer's colour when set. */
  stroke?: string;
}

const num = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Plotter SVG: physical mm size, viewBox in mm, one Inkscape layer per geometry layer, stroke-only paths,
 * no transforms, clipping, filters, CSS or raster content. Independent of the preview renderer.
 */
export function toSvg(g: GeometryCollection, s: ExportSettings, comment?: string): string {
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${num(g.widthMm)}mm" height="${num(g.heightMm)}mm" viewBox="0 0 ${num(g.widthMm)} ${num(g.heightMm)}">`,
  ];
  if (comment) out.push(`<!-- ${comment.replace(/--/g, "- -")} -->`);
  g.layers.forEach((layer, i) => {
    const paths = g.paths.filter((p) => p.layerId === layer.id && p.points.length >= 2);
    if (!paths.length) return;
    out.push(`<g id="layer${i + 1}" inkscape:groupmode="layer" inkscape:label="${i + 1} ${esc(layer.name)}" fill="none" stroke="${esc(s.stroke ?? layer.stroke)}" stroke-width="${num(s.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const p of paths) {
      let d = "M" + num(p.points[0].x) + "," + num(p.points[0].y);
      for (let j = 1; j < p.points.length; j++) d += "L" + num(p.points[j].x) + "," + num(p.points[j].y);
      if (p.closed) d += "Z";
      out.push(`<path d="${d}"/>`);
    }
    out.push(`</g>`);
  });
  out.push(`</svg>`);
  return out.join("\n");
}
