/**
 * The TS port must reproduce reference/js/streamlines.worker.js exactly: we load the reference worker in a
 * vm sandbox and compare fields, traced lines, simplification and ordering on the same input.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import type { Grid } from "../src/core/fields";
import { directionFromHeight } from "../src/fields/structureTensor";
import { valueNoise } from "../src/fields/noise";
import { type StreamlineParams, traceStreamlines } from "../src/engine/streamlines";
import { rdp } from "../src/engine/simplify";
import { orderPaths } from "../src/engine/order";

type Ref = {
  fields(photo: Float32Array, depth: null, W: number, H: number, p: object): { tone: Float32Array; c: Float32Array; s: Float32Array };
  trace(F: object, W: number, H: number, p: object, mmPerPx: number, cb: () => void): { lines: Float32Array[]; step: number };
  rdp(pts: Float32Array, tol: number): Float32Array;
  order(lines: Float32Array[]): { lines: Float32Array[]; travel: number };
  valueNoise(W: number, H: number, scale: number, seed: number): Float32Array;
};

function loadReference(): Ref {
  const src = readFileSync(fileURLToPath(new URL("../reference/js/streamlines.worker.js", import.meta.url)), "utf8");
  const ctx = vm.createContext({ self: {}, performance, Math, Float32Array, Uint8Array, Array });
  vm.runInContext(src.replace('"use strict";', ""), ctx);
  return ctx as unknown as Ref;
}

const W = 180, H = 240;
function testImage(): Float32Array {
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x - 90) / 70, v = (y - 120) / 95, r = Math.hypot(u, v);
    a[y * W + x] = Math.min(1, Math.max(0, 0.15 + 0.7 * r * r + 0.12 * Math.sin(x / 9) * Math.cos(y / 13)));
  }
  return a;
}

const refParams = {
  toneBlur: 0, contrast: 1, brightness: 0, invert: false, relief: 0,
  detail: 2.5, flowSigma: 14, globalW: 0.6, angle: 12, noise: 20, noiseScale: 30, seed: 7,
  minSp: 0.35, maxSp: 1.3, gamma: 0.5, testRatio: 0.55, stepQ: 0.35,
  minLen: 3, maxLen: 800, maxTurn: 40, whiteCut: 0.985, seedOrder: "dark",
};
const tsParams = (seedOrder: StreamlineParams["seedOrder"]): StreamlineParams => ({
  darkestSpacing: 0.35, lightestSpacing: 1.3, gamma: 0.5, clearance: 0.55, stepSize: 0.35,
  minLength: 3, maxLength: 800, maxTurn: 40, whiteCut: 0.985, seedOrder, seed: 7,
});
const mmPerPx = 0.2;

describe("parity with reference worker", () => {
  const ref = loadReference(), img = testImage();

  it("value noise", () => {
    expect(valueNoise(W, H, 30, 7)).toEqual(ref.valueNoise(W, H, 30, 7));
  });

  it("structure-tensor direction field", () => {
    const F = ref.fields(img, null, W, H, refParams);
    const grid: Grid = { width: W, height: H, mmPerPx: 1 }; // options in px == mm
    const d = directionFromHeight({ width: W, height: H, data: img }, grid,
      { detail: 2.5, swirlSize: 14, swirlStrength: 0.6, offset: 12, wobble: 20, wobbleSize: 30, seed: 7 });
    expect(d.c).toEqual(F.c);
    expect(d.s).toEqual(F.s);
  });

  for (const seedOrder of ["dark", "center", "random"] as const) {
    it(`streamlines, simplify and order (seed order: ${seedOrder})`, () => {
      const F = ref.fields(img, null, W, H, refParams);
      const r = ref.trace(F, W, H, { ...refParams, seedOrder }, mmPerPx, () => {});
      const t = traceStreamlines({
        direction: { width: W, height: H, c: F.c, s: F.s }, tone: { width: W, height: H, data: F.tone },
        mmPerPx, params: tsParams(seedOrder),
      });
      expect(r.lines.length).toBeGreaterThan(20);
      expect(t.step).toBe(r.step);
      expect(t.lines).toEqual(r.lines);

      const tol = 0.08 / mmPerPx;
      const rs = r.lines.map((L) => ref.rdp(L, tol)), ts = t.lines.map((L) => rdp(L, tol));
      expect(ts).toEqual(rs);
      const ro = ref.order(rs), to = orderPaths(ts);
      expect(to.lines).toEqual(ro.lines);
      expect(to.travel).toBeCloseTo(ro.travel, 6);
    });
  }
});
