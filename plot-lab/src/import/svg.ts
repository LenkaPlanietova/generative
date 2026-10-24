/**
 * Minimal SVG reader for Plot Layers: polylines from <path>, <polyline>, <polygon> and <line>, in sheet millimetres,
 * grouped by the Inkscape layer they sit in. Handles mm / cm / in / pt / px sizes with a viewBox, and translate /
 * scale / rotate / matrix transforms; curves are flattened. A string parser (no DOM), so it also runs in tests.
 */
import type { GeometryCollection, PlotPath, Point } from "../geometry/types";

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: M, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const nums = (s: string) => (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

export function parseTransform(t: string | undefined): M {
  let m = I;
  for (const [, fn, args] of (t ?? "").matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(args);
    let n: M = I;
    if (fn === "matrix" && a.length === 6) n = a as M;
    else if (fn === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === "scale") n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] ?? 0, cy = a[2] ?? 0;
      n = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX") n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };
function length(v: string | undefined): number | null {
  const m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v ?? "");
  return m ? Number(m[1]) * UNIT_MM[(m[2] ?? "").toLowerCase()] : null;
}

/** Path data → polylines (curves flattened into 16 segments; arcs drawn as straight lines). */
export function parsePathData(d: string): { points: [number, number][]; closed: boolean }[] {
  const out: { points: [number, number][]; closed: boolean }[] = [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, cur: [number, number][] = [], lcx = 0, lcy = 0, lq: [number, number] | null = null;
  const flush = (closed = false) => { if (cur.length > 1) out.push({ points: cur, closed }); cur = []; };
  const n = () => Number(tokens[i++]);
  const curve = (pts: [number, number][]) => {
    const [p0, ...c] = [[x, y] as [number, number], ...pts];
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, u = 1 - t;
      cur.push(c.length === 3
        ? [u ** 3 * p0[0] + 3 * u * u * t * c[0][0] + 3 * u * t * t * c[1][0] + t ** 3 * c[2][0], u ** 3 * p0[1] + 3 * u * u * t * c[0][1] + 3 * u * t * t * c[1][1] + t ** 3 * c[2][1]]
        : [u * u * p0[0] + 2 * u * t * c[0][0] + t * t * c[1][0], u * u * p0[1] + 2 * u * t * c[0][1] + t * t * c[1][1]]);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C !== "Z" && i >= tokens.length) break;
    let quad: [number, number] | null = null, cubic: [number, number] | null = null;
    if (C === "M") { flush(); x = ox + n(); y = oy + n(); sx = x; sy = y; cur = [[x, y]]; cmd = rel ? "l" : "L"; }
    else if (C === "L") { x = ox + n(); y = oy + n(); cur.push([x, y]); }
    else if (C === "H") { x = ox + n(); cur.push([x, y]); }
    else if (C === "V") { y = oy + n(); cur.push([x, y]); }
    else if (C === "Z") { if (cur.length) { cur.push([sx, sy]); flush(true); } x = sx; y = sy; cur = [[x, y]]; cmd = ""; }
    else if (C === "C" || C === "S") {
      const c1: [number, number] = C === "C" ? [ox + n(), oy + n()] : [2 * x - lcx, 2 * y - lcy];
      const c2: [number, number] = [ox + n(), oy + n()], e: [number, number] = [ox + n(), oy + n()];
      if (!cur.length) cur = [[x, y]];
      curve([c1, c2, e]); [x, y] = e; cubic = c2;
    } else if (C === "Q" || C === "T") {
      const c1: [number, number] = C === "Q" ? [ox + n(), oy + n()] : lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const e: [number, number] = [ox + n(), oy + n()];
      if (!cur.length) cur = [[x, y]];
      curve([c1, e]); [x, y] = e; quad = c1;
    } else if (C === "A") { i += 5; x = ox + n(); y = oy + n(); cur.push([x, y]); }
    else i++;
    [lcx, lcy] = cubic ?? [x, y];
    lq = quad;
  }
  flush();
  // A closing Z leaves the start point twice; drop the duplicate (the path is marked closed).
  for (const p of out) if (p.closed && p.points.length > 2) p.points.pop();
  return out;
}

export interface SvgImport {
  widthMm: number;
  heightMm: number;
  /** Layers in document order; paths outside any layer go under "". */
  layers: { name: string; paths: { points: Point[]; closed: boolean }[] }[];
}

export function parseSvg(text: string): SvgImport {
  const src = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const root = /<svg\b([^>]*)>/.exec(src);
  if (!root) throw new Error("No <svg> element.");
  const attr = (a: string, n: string) => new RegExp(`(?:^|\\s)${n}\\s*=\\s*"([^"]*)"`).exec(a)?.[1] ?? new RegExp(`(?:^|\\s)${n}\\s*=\\s*'([^']*)'`).exec(a)?.[1];
  const vb = nums(attr(root[1], "viewBox") ?? "");
  let w = length(attr(root[1], "width")), h = length(attr(root[1], "height"));
  if (vb.length === 4) { w ??= vb[2] * UNIT_MM.px; h ??= vb[3] * UNIT_MM.px; }
  if (!w || !h) throw new Error("The SVG has no usable width, height or viewBox.");
  const base: M = vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? [w / vb[2], 0, 0, h / vb[3], (-vb[0] * w) / vb[2], (-vb[1] * h) / vb[3]] : [UNIT_MM.px, 0, 0, UNIT_MM.px, 0, 0];

  const layers: SvgImport["layers"] = [];
  const layer = (name: string) => { let l = layers.find((x) => x.name === name); if (!l) layers.push((l = { name, paths: [] })); return l; };
  const stack: { m: M; name: string; tag: string }[] = [{ m: base, name: "", tag: "svg" }];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  re.lastIndex = root.index + root[0].length;
  for (let t; (t = re.exec(src));) {
    const [, close, tag, a, self] = t;
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const top = stack[stack.length - 1], m = mul(top.m, parseTransform(attr(a, "transform")));
    if (tag === "g") {
      const isLayer = attr(a, "inkscape:groupmode") === "layer";
      const name = isLayer ? attr(a, "inkscape:label") ?? attr(a, "id") ?? "" : top.name;
      if (!self) stack.push({ m, name, tag });
      continue;
    }
    if (/^(defs|clipPath|mask|symbol|marker|pattern|metadata)$/.test(tag)) {
      if (!self) {
        // Skip everything inside, including nested tags of the same name.
        let depth = 1;
        const inner = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
        inner.lastIndex = re.lastIndex;
        for (let u; depth && (u = inner.exec(src));) if (!u[2]) depth += u[1] ? -1 : 1;
        re.lastIndex = inner.lastIndex || src.length;
      }
      continue;
    }
    let polys: { points: [number, number][]; closed: boolean }[] = [];
    if (tag === "path") polys = parsePathData(attr(a, "d") ?? "");
    else if (tag === "polyline" || tag === "polygon") {
      const v = nums(attr(a, "points") ?? ""), pts: [number, number][] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      polys = [{ points: pts, closed: tag === "polygon" }];
    } else if (tag === "line") polys = [{ points: [[Number(attr(a, "x1") ?? 0), Number(attr(a, "y1") ?? 0)], [Number(attr(a, "x2") ?? 0), Number(attr(a, "y2") ?? 0)]], closed: false }];
    else if (!self && tag !== "path") { stack.push({ m, name: top.name, tag }); continue; }
    for (const p of polys) if (p.points.length >= 2) layer(top.name).paths.push({ points: p.points.map(([x, y]) => apply(m, x, y)), closed: p.closed });
  }
  return { widthMm: Math.round(w * 1000) / 1000, heightMm: Math.round(h * 1000) / 1000, layers };
}

/** Layer names that hold a mask: "mask" or "%mask" (any case, any leading number). */
export const isMaskLayer = (name: string) => /^\s*%?\s*\d*\s*mask\s*$/i.test(name);

/** The largest closed shape on the mask layer, or null. */
export function maskFromSvg(svg: SvgImport): Point[] | null {
  let best: Point[] | null = null, area = 0;
  for (const l of svg.layers) if (isMaskLayer(l.name)) for (const p of l.paths) {
    if (p.points.length < 3) continue;
    let a = 0;
    for (let i = 0; i < p.points.length; i++) { const q = p.points[i], r = p.points[(i + 1) % p.points.length]; a += q.x * r.y - r.x * q.y; }
    if (Math.abs(a) / 2 > area) { area = Math.abs(a) / 2; best = p.points; }
  }
  return best;
}

/** Everything except the mask and documentation (%) layers, as one input drawing. */
export function inputFromSvg(svg: SvgImport): GeometryCollection {
  const paths: PlotPath[] = [];
  for (const l of svg.layers) {
    if (isMaskLayer(l.name) || l.name.startsWith("%")) continue;
    for (const p of l.paths) paths.push({ id: `i${paths.length}`, points: p.points, closed: p.closed, layerId: "ink" });
  }
  return { widthMm: svg.widthMm, heightMm: svg.heightMm, layers: [{ id: "ink", name: "ink", stroke: "#000000" }], paths };
}
