/**
 * How AxiDraw Control reads Inkscape layer names — a port of `LayerProperties.parse` and `find_int` in the AxiDraw
 * driver (evil-mad/axidraw, path_objects.py). The Layers tab plots every layer whose leading integer equals the
 * chosen number ("1a" and "1b" are both layer 1); a name starting with % is a documentation layer that never plots;
 * a leading ! forces a pause before the layer. The driver does not strip leading whitespace.
 */
export interface AxiLayerName {
  /** Documentation layer: never plotted. */
  skip: boolean;
  pause: boolean;
  number: number | null;
}

export function parseLayerName(name: string): AxiLayerName {
  if (!name) return { skip: false, pause: false, number: null };
  if (name[0] === "%") return { skip: true, pause: false, number: null };
  const pause = name[0] === "!";
  const digits = /^\d+/.exec(pause ? name.slice(1) : name)?.[0];
  return { skip: false, pause, number: digits ? parseInt(digits, 10) : null };
}

export interface SvgLayer { id: string; label: string; paths: number }

/** Top-level Inkscape layers of an exported SVG, in document (plotting) order. */
export function svgLayers(svg: string): SvgLayer[] {
  const out: SvgLayer[] = [];
  const re = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
  for (let m; (m = re.exec(svg));) {
    if (!/inkscape:groupmode="layer"/.test(m[1])) continue;
    const attr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(m![1])?.[1] ?? "";
    out.push({ id: attr("id"), label: attr("inkscape:label").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'), paths: (m[2].match(/<path\b/g) ?? []).length });
  }
  return out;
}
