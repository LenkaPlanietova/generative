import { describe, expect, it } from "vitest";
import { flowField } from "../src/algorithms/flowField";
import { defaultParams } from "../src/algorithms/types";
import { DEFAULT_PAPER, sheetFor } from "../src/core/paper";
import { toSvg } from "../src/export/svg";
import { type Issue, plotWarnings, validateGeometry, validateSvgText } from "../src/export/validate";
import { runPipeline } from "../src/pipeline";
import { DEFAULT_OPTIMIZE } from "../src/plotter/optimize";
import { DEFAULT_PROFILE } from "../src/plotter/profiles";
import { collection, path } from "./helpers";

const sheet = sheetFor(DEFAULT_PAPER); // A4, 20 mm margin
const ok = { strokeWidth: 0.3, stroke: "#000000" };
const codes = (issues: Issue[], level = "error") => issues.filter((i) => i.level === level).map((i) => i.code);
const good = () => collection([path([[30, 30], [100, 40], [150, 200]]), path([[40, 40], [60, 40], [60, 60]], true)]);

describe("SVG export", () => {
  it("writes physical mm size, matching viewBox, stroke-only layer paths", () => {
    const svg = toSvg(good(), ok);
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('inkscape:groupmode="layer"');
    expect(svg).toContain('fill="none" stroke="#000000" stroke-width="0.3"');
    expect(svg).toContain('<path d="M30,30L100,40L150,200"/>');
    expect(svg).toContain('<path d="M40,40L60,40L60,60Z"/>');
    expect(validateSvgText(svg, sheet)).toEqual([]);
  });

  it("rounds coordinates cleanly", () => {
    expect(toSvg(collection([path([[30.123456, 30], [-0.0001 + 40, 40.005]])]), ok)).toContain('d="M30.12,30L40,40.01"');
  });
});

describe("export validation (geometry)", () => {
  it("passes valid geometry", () => expect(validateGeometry(good(), sheet, ok)).toEqual([]));
  it("blocks empty exports", () => expect(codes(validateGeometry(collection([]), sheet, ok))).toContain("EMPTY"));
  it("blocks single-point paths only", () => expect(codes(validateGeometry(collection([path([[50, 50]])]), sheet, ok))).toContain("EMPTY"));
  it("blocks non-finite coordinates", () =>
    expect(codes(validateGeometry(collection([path([[50, 50], [Number.NaN, 60], [70, Infinity]])]), sheet, ok))).toContain("NON_FINITE"));
  it("blocks geometry outside the drawing area", () =>
    expect(codes(validateGeometry(collection([path([[5, 50], [100, 50]])]), sheet, ok))).toContain("OUT_OF_AREA"));
  it("blocks huge coordinates", () =>
    expect(codes(validateGeometry(collection([path([[50, 50], [1e9, 50]])]), sheet, ok))).toContain("OUT_OF_AREA"));
  it("blocks wrong sheet dimensions", () =>
    expect(codes(validateGeometry(collection([path([[30, 30], [50, 50]])], 297, 420), sheet, ok))).toContain("DIMENSIONS"));
  it("blocks invisible strokes", () => {
    expect(codes(validateGeometry(good(), sheet, { strokeWidth: 0.3, stroke: "#ffffff" }))).toContain("STROKE_INVISIBLE");
    expect(codes(validateGeometry(good(), sheet, { strokeWidth: 0, stroke: "#000000" }))).toContain("STROKE_WIDTH");
    expect(codes(validateGeometry(good(), sheet, { strokeWidth: 0.3, stroke: "none" }))).toContain("STROKE_COLOR");
  });
});

describe("export validation (SVG text)", () => {
  const svg = toSvg(good(), ok);
  it("catches broken path data", () => expect(codes(validateSvgText(svg.replace("L100,40", "L100,NaN"), sheet))).toContain("SVG_PATH_DATA"));
  it("catches a wrong viewBox", () => expect(codes(validateSvgText(svg.replace("0 0 210 297", "0 0 793 1122"), sheet))).toContain("SVG_VIEWBOX"));
  it("catches raster images, clipping, CSS and non-scaling strokes", () => {
    for (const bad of ['<image href="x.png"/>', '<clipPath id="c"/>', '<style>path{}</style>', '<path vector-effect="non-scaling-stroke" d="M1,1L2,2"/>'])
      expect(codes(validateSvgText(svg.replace("</svg>", bad + "</svg>"), sheet)), bad).toContain("SVG_UNSUPPORTED");
  });
  it("catches solid fills", () => expect(codes(validateSvgText(svg.replace('fill="none"', 'fill="#000"'), sheet))).toContain("SVG_FILL"));
  it("catches an SVG with no paths", () => expect(codes(validateSvgText(toSvg(collection([]), ok), sheet))).toContain("SVG_EMPTY"));
});

describe("generate → export → parse", () => {
  it("a generated Flow Field exports a valid SVG whose paths lie inside the margins", async () => {
    const r = await runPipeline({ algorithmId: "flow-field", params: { ...defaultParams(flowField), resolution: 400 }, seed: 11, paper: DEFAULT_PAPER, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE });
    const svg = toSvg(r.geometry, ok);
    expect(validateGeometry(r.geometry, sheet, ok)).toEqual([]);
    expect(validateSvgText(svg, sheet)).toEqual([]);
    const ds = [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    expect(ds.length).toBe(r.geometry.paths.length);
    const nums = ds.flatMap((d) => d.replace(/[MLZ]/g, " ").trim().split(/[\s,]+/).map(Number));
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1), a = sheet.area;
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(a.x - 0.01);
    expect(Math.max(...xs)).toBeLessThanOrEqual(a.x + a.width + 0.01);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(a.y - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(a.y + a.height + 0.01);
  });

  it("warns about overlap on an extremely dense pattern", async () => {
    const params = { ...defaultParams(flowField), resolution: 400, darkestSpacing: 0.2, lightestSpacing: 0.5, clearance: 0.3, density: "constant", constantTone: 0 };
    const paper = { ...DEFAULT_PAPER, paper: "Custom" as const, customWidth: 80, customHeight: 80, margin: 10 };
    const r = await runPipeline({ algorithmId: "flow-field", params, seed: 3, paper, optimize: DEFAULT_OPTIMIZE, profile: DEFAULT_PROFILE });
    expect(codes(plotWarnings(r.geometry, r.after, 0.5, DEFAULT_PROFILE, sheetFor(paper)), "warning")).toContain("DENSITY");
  }, 20_000);
});
