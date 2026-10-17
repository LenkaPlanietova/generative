import { encode } from "fast-png";
import { describe, expect, it } from "vitest";
import { decodePngGray, downscale } from "../src/image/decode";
import { NO_ADJUST, placement, sampleImage } from "../src/image/sampler";
import type { GrayImage } from "../src/image/types";

describe("PNG decoding", () => {
  it("keeps 16-bit precision (no quantisation to 8 bits)", () => {
    const w = 1024, h = 2, data = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = (i % w) * 64; // 1024 distinct levels, finer than 8-bit
    const img = decodePngGray(encode({ width: w, height: h, data, depth: 16, channels: 1 }), "ramp.png");
    expect(img.bits).toBe(16);
    expect(new Set(Array.from(img.data.slice(0, w))).size).toBe(1024);
    for (let x = 0; x < w; x++) expect(img.data[x]).toBeCloseTo((x * 64) / 65535, 6);
  });
  it("converts RGB to luminance and composites transparency onto white paper", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255]);
    const img = decodePngGray(encode({ width: 4, height: 1, data: rgba, depth: 8, channels: 4 }), "c.png");
    expect(img.data[0]).toBeCloseTo(0.2126, 4);
    expect(img.data[1]).toBeCloseTo(1, 6); // fully transparent → paper
    expect(img.data[2]).toBeCloseTo(0, 6);
    expect(img.data[3]).toBeCloseTo(1, 6);
  });
  it("downscaling preserves the mean brightness", () => {
    const data = Float32Array.from({ length: 400 * 300 }, (_, i) => (i % 7) / 6);
    const img: GrayImage = { id: "t", name: "t", width: 400, height: 300, data, bits: 8 };
    const d = downscale(img, 100), mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(Math.max(d.width, d.height)).toBe(100);
    expect(mean(d.data)).toBeCloseTo(mean(data), 2);
  });
});

describe("image sampler", () => {
  const img: GrayImage = { id: "g", name: "g", width: 2, height: 1, data: Float32Array.from([0, 1]), bits: 8 };
  const area = { x: 10, y: 10, width: 100, height: 100 };
  it("fits inside, fills (crops) or stretches", () => {
    expect(placement(img, area, { ...NO_ADJUST, fit: "contain" })).toMatchObject({ left: 10, width: 100, height: 50, top: 35 });
    expect(placement(img, area, { ...NO_ADJUST, fit: "cover" })).toMatchObject({ top: 10, height: 100, width: 200, left: -40 });
    expect(placement(img, area, { ...NO_ADJUST, fit: "stretch" })).toMatchObject({ left: 10, top: 10, width: 100, height: 100 });
  });
  it("returns white outside the image and applies invert / contrast / brightness", () => {
    const g = { W: 3, H: 1, x0: 20, y0: 15, sx: 40, sy: 1 }; // (20,15) is above the contained image → outside
    expect(Array.from(sampleImage(img, area, g, NO_ADJUST))).toEqual([1, 1, 1]);
    const inside = { W: 2, H: 1, x0: 20, y0: 60, sx: 70, sy: 1 }; // cells narrower than 1.5 image px: no anti-alias blur
    const [dark, light] = sampleImage(img, area, inside, NO_ADJUST);
    expect(dark).toBeLessThan(0.1);
    expect(light).toBeGreaterThan(0.9);
    const [inv] = sampleImage(img, area, inside, { ...NO_ADJUST, invert: true });
    expect(inv).toBeCloseTo(1 - dark, 6);
    const [bright] = sampleImage(img, area, inside, { ...NO_ADJUST, brightness: 0.3 });
    expect(bright).toBeCloseTo(Math.min(1, dark + 0.3), 6);
  });
  it("applies levels: black point, white point and midtones", () => {
    const ramp: GrayImage = { id: "r", name: "r", width: 5, height: 1, data: Float32Array.from([0.05, 0.3, 0.5, 0.85, 0.93]), bits: 8 };
    const a = { x: 0, y: 0, width: 50, height: 10 }, g = { W: 5, H: 1, x0: 5, y0: 5, sx: 10, sy: 1 };
    const s = (o: object) => Array.from(sampleImage(ramp, a, g, { ...NO_ADJUST, fit: "stretch", ...o }));
    expect(s({})).toEqual(Array.from(ramp.data));
    const lv = s({ blackPoint: 0.1, whitePoint: 0.9 });
    expect(lv[0]).toBe(0);
    expect(lv[2]).toBeCloseTo(0.5, 6);
    expect(lv[3]).toBeCloseTo(0.9375, 6);
    expect(lv[4]).toBe(1); // lit skin above the white point becomes paper white
    const mid = s({ midtones: 2 });
    expect(mid[2]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(mid[2]).toBeGreaterThan(0.5);
  });
});
