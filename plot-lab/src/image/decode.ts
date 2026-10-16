/**
 * Image decoding. PNG goes through a real decoder (fast-png) so 16-bit depth maps keep their precision —
 * <img>/canvas would quantise them to 8 bits. JPEG (and anything else) uses the browser decoder.
 */
import { convertIndexedToRgb, decode as decodePng, hasPngSignature } from "fast-png";
import type { GrayImage } from "./types";

/** Longest side kept after import; larger images are box-averaged down (precision is kept). */
export const MAX_IMAGE_SIDE = 3000;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Unpack 1/2/4-bit samples to one value per array entry. */
function unpack(data: ArrayLike<number>, width: number, height: number, channels: number, depth: number): Uint8Array {
  const perRow = Math.ceil((width * channels * depth) / 8), out = new Uint8Array(width * height * channels), mask = (1 << depth) - 1;
  for (let y = 0; y < height; y++) for (let i = 0; i < width * channels; i++) {
    const bit = i * depth, byte = data[y * perRow + (bit >> 3)];
    out[y * width * channels + i] = (byte >> (8 - depth - (bit & 7))) & mask;
  }
  return out;
}

export function checksum(data: Float32Array): string {
  let h = 0;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let i = 0; i < data.length; i += step) h = (h * 31 + Math.round(data[i] * 65535)) >>> 0;
  return h.toString(36);
}

export function makeGrayImage(name: string, width: number, height: number, data: Float32Array, bits: number): GrayImage {
  const img = downscale({ id: "", name, width, height, data, bits }, MAX_IMAGE_SIDE);
  img.id = `${name}:${img.width}x${img.height}:${bits}:${checksum(img.data)}`;
  return img;
}

/** Box-average downscale so the longest side is at most `max`. */
export function downscale(img: GrayImage, max: number): GrayImage {
  const k = Math.max(img.width, img.height) / max;
  if (k <= 1) return img;
  const W = Math.round(img.width / k), H = Math.round(img.height / k), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor((y * img.height) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / H));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * img.width) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / W));
      let s = 0;
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) s += img.data[j * img.width + i];
      out[y * W + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { ...img, width: W, height: H, data: out };
}

/** Decode PNG bytes to luminance at full bit depth (transparent areas become white paper). */
export function decodePngGray(bytes: ArrayBuffer | Uint8Array, name: string): GrayImage {
  const png = decodePng(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  let { channels, depth } = png;
  let data: ArrayLike<number> = png.data;
  if (png.palette) {
    data = convertIndexedToRgb(png);
    channels = png.palette[0]?.length ?? 3;
    depth = 8;
  } else if (depth < 8) data = unpack(data, png.width, png.height, channels, depth);
  const max = (1 << depth) - 1, n = png.width * png.height, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * channels, v = (k: number) => data[o + k] / max;
    let l: number, a = 1;
    if (channels <= 2) { l = v(0); if (channels === 2) a = v(1); }
    else { l = luminance(v(0), v(1), v(2)); if (channels === 4) a = v(3); }
    out[i] = l * a + (1 - a);
  }
  return makeGrayImage(name, png.width, png.height, out, depth);
}

/** Decode any image file in the browser: PNG via fast-png, everything else via createImageBitmap (8-bit). */
export async function decodeImageFile(file: Blob & { name?: string }): Promise<GrayImage> {
  const bytes = new Uint8Array(await file.arrayBuffer()), name = file.name ?? "image";
  if (hasPngSignature(bytes)) return decodePngGray(bytes, name);
  const bmp = await createImageBitmap(file);
  const cv = new OffscreenCanvas(bmp.width, bmp.height), ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data, out = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < out.length; i++) out[i] = luminance(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255);
  return makeGrayImage(name, bmp.width, bmp.height, out, 8);
}

/** Stretch to the full 0..1 range (depth maps). */
export function normalise(img: GrayImage): GrayImage {
  let lo = Infinity, hi = -Infinity;
  for (const v of img.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const r = hi - lo || 1;
  return { ...img, data: img.data.map((v) => (v - lo) / r) };
}
