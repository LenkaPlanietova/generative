import type { Path } from "../core/path";

export interface SvgLayer {
  label: string;
  paths: Path[];
  stroke?: string;
}

/** Hand-written plotter SVG: mm units, one Inkscape layer per group, no transforms. */
export function toSvg(opts: { width: number; height: number; penWidth: number; layers: SvgLayer[]; comment?: string }): string {
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(opts.width)}mm" height="${f(opts.height)}mm" viewBox="0 0 ${f(opts.width)} ${f(opts.height)}">`,
  ];
  if (opts.comment) out.push(`<!-- ${opts.comment.replace(/--/g, "- -")} -->`);
  opts.layers.forEach((layer, i) => {
    out.push(`<g inkscape:groupmode="layer" inkscape:label="${i + 1} ${layer.label}" fill="none" stroke="${layer.stroke ?? "#000"}" stroke-width="${f(opts.penWidth)}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const p of layer.paths) {
      if (p.length < 4) continue;
      let d = "M" + f(p[0]) + "," + f(p[1]);
      for (let j = 2; j < p.length; j += 2) d += "L" + f(p[j]) + "," + f(p[j + 1]);
      out.push(`<path d="${d}"/>`);
    }
    out.push(`</g>`);
  });
  out.push(`</svg>`);
  return out.join("\n");
}
