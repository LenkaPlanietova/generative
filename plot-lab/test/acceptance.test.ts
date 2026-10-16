/**
 * SPEC_ADDENDUM §D.1 acceptance test: Redraw with reference/examples/source_lineart.png and the README settings
 * must be visually equivalent to reference/examples/redraw_dense_A3.svg (about 1,000–1,100 paths, 30–35 m of ink on A3).
 * "Visually equivalent" is measured as the correlation of ink density on a 4 mm grid.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { redraw } from "../src/algorithms/redraw";
import { defaultParams } from "../src/algorithms/types";
import { decodePngGray } from "../src/image/decode";
import { runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";

const ref = (f: string) => fileURLToPath(new URL(`../reference/examples/${f}`, import.meta.url));

function density(polys: [number, number][][], cell = 4): Float64Array {
  const GW = Math.ceil(297 / cell), out = new Float64Array(GW * Math.ceil(420 / cell));
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(l / 0.5));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; out[Math.floor((y0 + (y1 - y0) * t) / cell) * GW + Math.floor((x0 + (x1 - x0) * t) / cell)] += l / n; }
  }
  return out;
}
function correlation(a: Float64Array, b: Float64Array): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb);
}

describe("acceptance: Redraw reproduces redraw_dense_A3.svg", () => {
  it("matches path count, ink length and tonal layout", async () => {
    const photo = decodePngGray(readFileSync(ref("source_lineart.png")), "source_lineart.png");
    const r = await runPipeline({
      algorithmId: "redraw", params: defaultParams(redraw), seed: 1, images: { photo },
      paper: { paper: "A3", orientation: "portrait", margin: 20, customWidth: 0, customHeight: 0 },
      optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE,
    });
    expect(r.after.paths).toBeGreaterThanOrEqual(1000);
    expect(r.after.paths).toBeLessThanOrEqual(1100);
    expect(r.after.penDown / 1000).toBeGreaterThanOrEqual(30);
    expect(r.after.penDown / 1000).toBeLessThanOrEqual(35);
    expect(r.after.penUp / 1000).toBeLessThan(6); // reference: ~4 m after ordering

    const svg = readFileSync(ref("redraw_dense_A3.svg"), "utf8");
    const refPolys = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1].replace(/[ML]/g, " ").trim().split(/\s+/).map((q) => q.split(",").map(Number) as [number, number]));
    const ours = r.geometry.paths.map((p) => p.points.map((q) => [q.x, q.y] as [number, number]));
    expect(correlation(density(ours), density(refPolys))).toBeGreaterThan(0.93);
  }, 120_000);
});
