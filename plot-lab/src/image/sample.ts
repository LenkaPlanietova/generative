/**
 * Built-in sample: a procedural bust (head turned slightly, lit from the upper left) as a photo plus a matching
 * depth map, so image-driven algorithms work before anything is imported. Ported from reference/demo.
 */
import type { GrayImage } from "./types";

let cache: { photo: GrayImage; depth: GrayImage } | null = null;

export function sampleImages(): { photo: GrayImage; depth: GrayImage } {
  if (cache) return cache;
  const w = 600, h = 800, dep = new Float32Array(w * h), ton = new Float32Array(w * h).fill(1);
  const G = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x - 300) / 185, v = (y - 360) / 245, r = 1 - u * u - v * v;
    let d = 0;
    if (r > 0) {
      d = Math.sqrt(r) * 0.75;
      d += 0.16 * G(x, y, 272, 360, 22, 95) + 0.1 * G(x, y, 268, 450, 34, 24); // nose
      d -= 0.11 * G(x, y, 210, 320, 48, 24) + 0.11 * G(x, y, 350, 320, 48, 24); // eye sockets
      d += 0.05 * G(x, y, 272, 525, 58, 15) + 0.04 * G(x, y, 272, 553, 46, 13); // lips
      d += 0.07 * G(x, y, 190, 450, 60, 70) + 0.07 * G(x, y, 370, 450, 60, 70); // cheeks
      d += 0.05 * G(x, y, 272, 255, 120, 40); // brow
    }
    const nu = (x - 285) / 95;
    if (y > 520 && Math.abs(nu) < 1) d = Math.max(d, Math.sqrt(1 - nu * nu) * 0.45 * Math.min(1, (y - 520) / 60)); // neck
    dep[y * w + x] = d;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, d = dep[i];
    if (d <= 0.001) continue;
    const gx = (dep[i + 1] - dep[i - 1]) * 130, gy = (dep[i + w] - dep[i - w]) * 130, l = Math.hypot(gx, gy, 1);
    const lam = Math.max(0, (-gx / l) * -0.62 + (-gy / l) * -0.42 + (1 / l) * 0.66);
    ton[i] = Math.min(1, 0.05 + lam * 0.82);
  }
  let mx = 0;
  for (const d of dep) mx = Math.max(mx, d);
  for (let i = 0; i < dep.length; i++) dep[i] /= mx;
  cache = {
    photo: { id: "sample:photo", name: "Sample head", width: w, height: h, data: ton, bits: 16 },
    depth: { id: "sample:depth", name: "Sample head depth", width: w, height: h, data: dep, bits: 16 },
  };
  return cache;
}
