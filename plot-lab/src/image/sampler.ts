/**
 * Image sampling: places an image on the drawing area (fit, scale, offset — together a crop), applies tone
 * adjustments and returns normalised luminance on any grid. Every image-driven algorithm uses this.
 */
import { blur } from "../core/blur";
import type { Rect } from "../geometry/clip";
import type { GrayImage } from "./types";

export interface ImageAdjust {
  fit: "contain" | "cover" | "stretch";
  /** × the fitted size */
  scale: number;
  /** mm, from the area centre */
  offsetX: number;
  offsetY: number;
  /** Levels, applied first: [blackPoint, whitePoint] → [0, 1], then v^(1/midtones). */
  blackPoint?: number;
  whitePoint?: number;
  midtones?: number;
  brightness: number;
  contrast: number;
  invert: boolean;
  /** mm */
  blur: number;
}

export const NO_ADJUST: ImageAdjust = { fit: "contain", scale: 1, offsetX: 0, offsetY: 0, brightness: 0, contrast: 1, invert: false, blur: 0 };

/** Where the image lands, in mm: top-left corner and mm per image pixel along x and y. */
export function placement(img: Pick<GrayImage, "width" | "height">, area: Rect, a: Pick<ImageAdjust, "fit" | "scale" | "offsetX" | "offsetY">) {
  let kx = area.width / img.width, ky = area.height / img.height;
  if (a.fit === "contain") kx = ky = Math.min(kx, ky);
  else if (a.fit === "cover") kx = ky = Math.max(kx, ky);
  kx *= a.scale; ky *= a.scale;
  const w = img.width * kx, h = img.height * ky;
  return { left: area.x + (area.width - w) / 2 + a.offsetX, top: area.y + (area.height - h) / 2 + a.offsetY, kx, ky, width: w, height: h };
}

/** A sampling grid: cell (i, j) sits at (x0 + i·sx, y0 + j·sy) mm. */
export interface SampleGrid { W: number; H: number; x0: number; y0: number; sx: number; sy: number }

/**
 * Luminance of `img` on the grid with adjustments. Outside the image the value is `outside`.
 * When a grid cell covers several image pixels the image is pre-blurred, so detail isn't aliased.
 * With `adjust: false` only placement is applied (for depth maps).
 */
export function sampleImage(img: GrayImage, area: Rect, g: SampleGrid, a: ImageAdjust, outside = 1, adjust = true): Float32Array {
  const p = placement(img, area, a), pxPerCell = Math.max(g.sx / p.kx, g.sy / p.ky);
  const src = pxPerCell > 1.5 ? blur(img.data, img.width, img.height, 0.45 * pxPerCell) : img.data;
  const out = new Float32Array(g.W * g.H), Wm = img.width - 1, Hm = img.height - 1;
  const bp = a.blackPoint ?? 0, wp = Math.max(bp + 0.01, a.whitePoint ?? 1), ig = 1 / Math.max(0.05, a.midtones ?? 1);
  const levels = bp !== 0 || wp !== 1 || ig !== 1;
  for (let j = 0; j < g.H; j++) {
    const v = (g.y0 + j * g.sy - p.top) / p.ky - 0.5;
    for (let i = 0; i < g.W; i++) {
      const u = (g.x0 + i * g.sx - p.left) / p.kx - 0.5;
      let val: number;
      if (u < -0.5 || v < -0.5 || u > Wm + 0.5 || v > Hm + 0.5) val = outside;
      else {
        const x = Math.min(Wm, Math.max(0, u)), y = Math.min(Hm, Math.max(0, v));
        const x0 = Math.max(0, Math.min(Wm - 1, x | 0)), y0 = Math.max(0, Math.min(Hm - 1, y | 0)); // 1-pixel-wide images: index 0
        const fx = Wm ? x - x0 : 0, fy = Hm ? y - y0 : 0, k = y0 * img.width + x0;
        const r1 = Wm ? src[k] * (1 - fx) + src[k + 1] * fx : src[k];
        const r2 = Hm ? (Wm ? src[k + img.width] * (1 - fx) + src[k + img.width + 1] * fx : src[k + img.width]) : r1;
        val = r1 * (1 - fy) + r2 * fy;
        if (adjust) {
          if (levels) {
            val = (val - bp) / (wp - bp);
            val = val <= 0 ? 0 : val >= 1 ? 1 : val ** ig;
          }
          val = (val - 0.5) * a.contrast + 0.5 + a.brightness;
          val = val < 0 ? 0 : val > 1 ? 1 : val;
          if (a.invert) val = 1 - val;
        }
      }
      out[j * g.W + i] = val;
    }
  }
  return adjust && a.blur > 0 ? blur(out, g.W, g.H, a.blur / Math.max(g.sx, g.sy)) : out;
}

/** Luminance of the image on a `cell`-mm grid over the area, with a bilinear lookup in mm. */
export function lumaSampler(img: GrayImage, area: Rect, a: ImageAdjust, cell: number) {
  const W = Math.max(2, Math.ceil(area.width / cell) + 1), H = Math.max(2, Math.ceil(area.height / cell) + 1);
  const data = sampleImage(img, area, { W, H, x0: area.x, y0: area.y, sx: cell, sy: cell }, a, 1);
  return (x: number, y: number): number => {
    let u = (x - area.x) / cell, v = (y - area.y) / cell;
    if (u < 0 || v < 0 || u > W - 1 || v > H - 1) return 1;
    u = Math.min(u, W - 1.001); v = Math.min(v, H - 1.001);
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, k = y0 * W + x0;
    return (data[k] * (1 - fx) + data[k + 1] * fx) * (1 - fy) + (data[k + W] * (1 - fx) + data[k + W + 1] * fx) * fy;
  };
}
