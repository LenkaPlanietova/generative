import { describe, expect, it } from "vitest";
import { flowField } from "../src/algorithms/flowField";
import { spirograph } from "../src/algorithms/spirograph";
import { defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER, sheetFor } from "../src/core/paper";
import { validateGeometry } from "../src/export/validate";
import { type ClipShape, DEFAULT_CLIP, applyClip, clipToShape } from "../src/geometry/clipShape";
import type { GrayImage } from "../src/image/types";
import { runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";
import { type ProjectState, embedImage, makeProject, parseProject, unembedImage } from "../src/project/project";
import { makeVariations } from "../src/project/variations";
import { collection, path } from "./helpers";

const circle: ClipShape = { shape: "circle", cx: 0, cy: 0, width: 20, height: 20, keep: "inside" };
const r = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("clip to shape", () => {
  it("cuts a line exactly at a circle", () => {
    const [piece] = clipToShape([{ x: -30, y: 0 }, { x: 30, y: 0 }], false, circle);
    expect(piece.points[0].x).toBeCloseTo(-10, 9);
    expect(piece.points[1].x).toBeCloseTo(10, 9);
  });
  it("keeps the two outside pieces when keeping outside", () => {
    const pieces = clipToShape([{ x: -30, y: 0 }, { x: 30, y: 0 }], false, { ...circle, keep: "outside" });
    expect(pieces).toHaveLength(2);
    expect(pieces[0].points.map((p) => p.x)).toEqual([-30, -10]);
    expect(pieces[1].points[0].x).toBeCloseTo(10, 9);
  });
  it("cuts a polyline that leaves and re-enters into separate pieces on the boundary", () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: -25 + i * 0.25, y: 12 * Math.sin(i * 0.1) }));
    const pieces = clipToShape(pts, false, circle);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) for (const q of p.points) expect(r(q)).toBeLessThanOrEqual(10 + 1e-9);
    for (const p of pieces) { expect(r(p.points[0])).toBeCloseTo(10, 6); }
  });
  it("leaves closed shapes inside closed, rejoins a cut ring through its start, handles ellipses and rectangles", () => {
    const sq = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }];
    expect(clipToShape(sq, true, circle)).toEqual([{ points: sq, closed: true }]);
    const ring = Array.from({ length: 64 }, (_, i) => ({ x: 15 * Math.cos((i / 64) * 2 * Math.PI), y: 15 * Math.sin((i / 64) * 2 * Math.PI) }));
    const cut = clipToShape(ring, true, { shape: "rectangle", cx: 0, cy: 0, width: 100, height: 100, keep: "inside" });
    expect(cut).toEqual([{ points: ring, closed: true }]);
    const half = clipToShape(ring, true, { shape: "rectangle", cx: 50, cy: 0, width: 100, height: 100, keep: "inside" });
    expect(half).toHaveLength(1); // the right half, one piece through the start point (15, 0)
    for (const q of half[0].points) expect(q.x).toBeGreaterThanOrEqual(-1e-9);
    const [e] = clipToShape([{ x: -30, y: 0 }, { x: 30, y: 0 }], false, { ...circle, shape: "ellipse", width: 40, height: 10 });
    expect(e.points[0].x).toBeCloseTo(-20, 9);
  });
  it("adds the outline as its own layer, clipped to the drawing area", () => {
    const sheet = sheetFor(DEFAULT_PAPER);
    const g = applyClip(collection([path([[30, 100], [180, 100]])]), { ...DEFAULT_CLIP, enabled: true, outline: true, width: 300 }, sheet.area);
    expect(g.layers.map((l) => l.id)).toContain("clip-outline");
    expect(validateGeometry(g, sheet, { strokeWidth: 0.3, stroke: "#000000" })).toEqual([]);
  });
  it("runs in the pipeline: everything ends up inside the circle", async () => {
    const res = await runPipeline({
      algorithmId: "flow-field", params: { ...defaultParams(flowField), resolution: 300, darkestSpacing: 1.2 }, seed: 3, paper: DEFAULT_PAPER,
      optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE, clip: { ...DEFAULT_CLIP, enabled: true, width: 100 },
    });
    expect(res.geometry.paths.length).toBeGreaterThan(10);
    for (const p of res.geometry.paths) for (const q of p.points) expect(Math.hypot(q.x - 105, q.y - 148.5)).toBeLessThanOrEqual(50.06); // + simplify tolerance
  });
});

const state = (over: Partial<ProjectState> = {}): ProjectState => ({
  projectName: "My piece", algorithmId: "spirograph", params: { spirograph: { ...defaultParams(spirograph), copies: 5 } }, seed: 4242,
  paper: { ...DEFAULT_PAPER, paper: "A3", orientation: "landscape" }, profile: { ...DEFAULT_PROFILE, penDownSpeed: 42 }, penWidth: 0.25,
  strokeColor: "#112233", paperColor: "#fffff0", optimize: { ...DEFAULT_OPTIMIZE, simplify: 0.1 }, clip: { ...DEFAULT_CLIP, enabled: true }, ...over,
});

describe("project files", () => {
  it("round-trips every saved setting", () => {
    const p = makeProject(state()), r = parseProject(JSON.stringify(p));
    if ("error" in r) throw new Error(r.error);
    expect(r.project).toEqual(p);
    expect(r.project.params.copies).toBe(5);
  });
  it("embeds 16-bit images losslessly (to 16-bit precision)", () => {
    const data = Float32Array.from({ length: 64 * 4 }, (_, i) => (i * 257) / 65535 / 4);
    const img: GrayImage = { id: "d", name: "depth.png", width: 64, height: 4, data, bits: 16 };
    const back = unembedImage(embedImage(img));
    expect(back.bits).toBe(16);
    for (let i = 0; i < data.length; i++) expect(Math.abs(back.data[i] - data[i])).toBeLessThan(1 / 65535);
  });
  it("only embeds images for algorithms that use them", () => {
    const img: GrayImage = { id: "p", name: "p.png", width: 2, height: 2, data: new Float32Array(4), bits: 8 };
    expect(makeProject(state(), { photo: img }).images).toBeUndefined();
    expect(makeProject(state({ algorithmId: "redraw" }), { photo: img }).images?.photo?.bits).toBe(8);
  });
  it("rejects files that aren't projects, and clamps bad values", () => {
    expect(parseProject("not json")).toEqual({ error: expect.stringMatching(/JSON/) });
    expect(parseProject(JSON.stringify({ format: "other" }))).toEqual({ error: expect.stringMatching(/project/) });
    expect(parseProject(JSON.stringify({ ...makeProject(state()), algorithmId: "nope" }))).toEqual({ error: expect.stringMatching(/Unknown algorithm/) });
    expect(parseProject(JSON.stringify({ ...makeProject(state()), version: 99 }))).toEqual({ error: expect.stringMatching(/newer/) });
    const bad = parseProject(JSON.stringify({ ...makeProject(state()), seed: -5, penWidth: 99, strokeColor: "red", params: { copies: 9999 } }));
    if ("error" in bad) throw new Error(bad.error);
    expect(bad.project).toMatchObject({ seed: 1, penWidth: 2, strokeColor: "#000000" });
    expect(bad.project.params.copies).toBe(24);
  });
});

describe("variations", () => {
  const base = defaultParams(flowField);
  it("are deterministic, and new seeds keep the parameters", () => {
    const a = makeVariations(flowField, base, 7, 9, "seed", 0.2, 0), b = makeVariations(flowField, base, 7, 9, "seed", 0.2, 0);
    expect(a).toEqual(b);
    expect(new Set(a.map((v) => v.seed)).size).toBe(9);
    for (const v of a) expect(v.params).toEqual(base);
    expect(makeVariations(flowField, base, 7, 9, "seed", 0.2, 1)).not.toEqual(a); // Shuffle
  });
  it("mutation stays within the amount and never touches image, quality or pen-safety settings", () => {
    const vs = makeVariations(flowField, base, 7, 9, "mutate", 0.1, 0);
    for (const v of vs) {
      expect(v.seed).toBe(7);
      expect(v.params.resolution).toBe(base.resolution);
      expect(v.params.darkestSpacing).toBe(base.darkestSpacing);
      expect([v.params.centreX, v.params.centreY, v.params.radius]).toEqual([base.centreX, base.centreY, base.radius]); // composition stays
      for (const d of flowField.parameters) if (d.type === "number")
        expect(Math.abs((v.params[d.id] as number) - (base[d.id] as number))).toBeLessThanOrEqual(0.1 * (d.max - d.min) + d.step);
    }
    expect(vs.some((v) => JSON.stringify(v.params) !== JSON.stringify(base))).toBe(true);
  });
});
