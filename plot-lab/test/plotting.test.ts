import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER, sheetFor } from "../src/core/paper";
import { inkedLayers, toSvg } from "../src/export/svg";
import { SHORT_TRAVEL, plotWarnings, validateSvgText } from "../src/export/validate";
import { crc32, zip } from "../src/export/zip";
import type { GeometryCollection } from "../src/geometry/types";
import { DEFAULT_OPTIMIZE, joinGaps, optimize } from "../src/plotter/optimize";
import { DEFAULT_PROFILE, calibrate } from "../src/plotter/profiles";
import { plotStats, retime, travelMoves } from "../src/plotter/stats";
import { collection, path } from "./helpers";

const flat = { penDownSpeed: 10, penUpSpeed: 20, penLiftDelay: 1 };

describe("time estimate", () => {
  it("adds nothing for straight lines and a full stop for a reversal", () => {
    const straight = plotStats(collection([path([[0, 0], [10, 0], [20, 0], [30, 0]])]), flat);
    expect(straight.corners).toBeCloseTo(0, 9);
    const back = plotStats(collection([path([[0, 0], [10, 0], [0, 0]])]), flat);
    expect(back.corners).toBeCloseTo(1, 9);
    const right = plotStats(collection([path([[0, 0], [10, 0], [10, 10]])]), flat);
    expect(right.corners).toBeCloseTo(0.25, 9);
  });

  it("charges acceleration per stop and per pen-up move", () => {
    const g = collection([path([[0, 10], [30, 10], [30, 40]]), path([[40, 40], [60, 40]])]);
    const s = plotStats(g, { ...flat, acceleration: 100 });
    const base = s.penDown / 10 + s.penUp / 20 + 2;
    // 2 path stops + 0.25 corner at pen-down speed, 2 pen-up moves at pen-up speed.
    expect(s.time).toBeCloseTo(base + ((2 + 0.25) * 10 + 2 * 20) / 100, 9);
    expect(retime(s, { ...flat, acceleration: 0 })).toBeCloseTo(base, 9);
  });

  it("scales by the calibration factor and calibrates from a real plot", () => {
    const s = plotStats(collection([path([[0, 0], [100, 0]])]), DEFAULT_PROFILE);
    expect(retime(s, { ...DEFAULT_PROFILE, timeFactor: 1.5 })).toBeCloseTo(1.5 * s.time, 9);
    const f = calibrate(s.time, 2 * s.time);
    expect(f).toBeCloseTo(2, 9);
    expect(retime(s, { ...DEFAULT_PROFILE, timeFactor: f })).toBeCloseTo(2 * s.time, 9);
    expect(calibrate(0, 100)).toBe(1);
    expect(calibrate(100, 1e6)).toBe(5);
  });

  it("estimates a smooth curve near its travel time", () => {
    const circle = Array.from({ length: 720 }, (_, i): [number, number] => [100 + 50 * Math.cos(i / 720 * 2 * Math.PI), 100 + 50 * Math.sin(i / 720 * 2 * Math.PI)]);
    const s = plotStats(collection([path(circle, true)]), DEFAULT_PROFILE);
    expect(s.corners).toBeLessThan(0.01);
  });
});

describe("short pen-up moves", () => {
  const hatch = (gap: number) => collection(Array.from({ length: 100 }, (_, i) => path([[20 + i * (5 + gap), 20], [25 + i * (5 + gap), 20]], false, "ink", `h${i}`)), 700, 297);

  it("measures the travel between paths", () => {
    expect(travelMoves(hatch(0.2))).toHaveLength(99);
    expect(Math.max(...travelMoves(hatch(0.2)))).toBeCloseTo(0.2, 9);
  });

  it("warns when many moves are shorter than the threshold", () => {
    const sheet = sheetFor({ ...DEFAULT_PAPER, paper: "Custom", customWidth: 700, customHeight: 297, orientation: "landscape", margin: 10 });
    const warn = (g: GeometryCollection) => plotWarnings(g, plotStats(g, DEFAULT_PROFILE), 0.3, DEFAULT_PROFILE, sheet).map((i) => i.code);
    expect(warn(hatch(0.2))).toContain("SHORT_TRAVEL");
    expect(warn(hatch(SHORT_TRAVEL + 0.5))).not.toContain("SHORT_TRAVEL");
    expect(warn(optimize(hatch(0.2), { ...DEFAULT_OPTIMIZE, joinGap: 0.3 }))).not.toContain("SHORT_TRAVEL");
  });

  it("joins only gaps within the limit, on the same layer, keeping every point", () => {
    const j = joinGaps(hatch(0.2).paths, 0.25);
    expect(j).toHaveLength(1);
    expect(j[0].points).toHaveLength(200);
    expect(joinGaps(hatch(0.2).paths, 0.1)).toHaveLength(100);
    const two = [path([[0, 0], [5, 0]], false, "a"), path([[5.1, 0], [9, 0]], false, "b")];
    expect(joinGaps(two, 1)).toHaveLength(2);
  });

  it("keeps a closed path's closing segment when joining it", () => {
    const sq = path([[0, 0], [10, 0], [10, 10], [0, 10]], true), tail = path([[0.1, 0], [-10, 0]]);
    const [j] = joinGaps([sq, tail], 0.5);
    expect(j.closed).toBe(false);
    expect(j.points.slice(0, 5).map((p) => [p.x, p.y])).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(plotStats(collection([j]), flat).penDown).toBeCloseTo(40 + 0.1 + 10.1, 9);
  });

  it("is off by default", () => {
    expect(optimize(hatch(0.2), DEFAULT_OPTIMIZE).paths).toHaveLength(100);
  });
});

describe("one file per layer", () => {
  const g: GeometryCollection = {
    widthMm: 210, heightMm: 297,
    layers: [{ id: "a", name: "Hatch 1", stroke: "#000000" }, { id: "e", name: "Empty", stroke: "#000000" }, { id: "b", name: "Hatch 2", stroke: "#000000" }],
    paths: [path([[20, 20], [50, 20]], false, "a", "1"), path([[20, 30], [50, 60]], false, "b", "2"), path([[30, 30], [40, 30]], false, "b", "3")],
  };

  it("lists only layers with ink", () => {
    expect(inkedLayers(g).map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("writes a valid full-page SVG holding just that layer, numbered as in the full file", () => {
    const svg = toSvg(g, { strokeWidth: 0.3 }, undefined, "b");
    expect(validateSvgText(svg, { width: 210, height: 297 })).toEqual([]);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('inkscape:label="3 Hatch 2"');
    expect(svg).not.toContain("Hatch 1");
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes an archive that unzip accepts", () => {
    const files = [{ name: "a.svg", data: "<svg>a</svg>" }, { name: "layer2-Šrafy.svg", data: "<svg>" + "b".repeat(5000) + "</svg>" }];
    const dir = mkdtempSync(join(tmpdir(), "plotlab-zip-")), file = join(dir, "t.zip");
    writeFileSync(file, zip(files));
    let listing: string;
    try {
      listing = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // no unzip on this machine
      throw e;
    }
    expect(listing).toContain("No errors detected");
    expect(execFileSync("unzip", ["-p", file, "a.svg"], { encoding: "utf8" })).toBe("<svg>a</svg>");
  });
});
