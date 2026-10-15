import { type DirectionField, type ScalarField, angleAt } from "../core/fields";
import type { Path } from "../core/path";

/** Mapping from sheet mm to canvas device px. */
export interface View {
  pxPerMm: number;
}

/** Stroke paths at the real pen width at physical scale, so density in the preview matches the plot. */
export function strokePaths(ctx: CanvasRenderingContext2D, paths: Path[], v: View, penWidth: number, color: string): void {
  const k = v.pxPerMm;
  ctx.strokeStyle = color;
  ctx.lineWidth = penWidth * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const p of paths) {
    ctx.moveTo(p[0] * k, p[1] * k);
    for (let j = 2; j < p.length; j += 2) ctx.lineTo(p[j] * k, p[j + 1] * k);
  }
  ctx.stroke();
}

/** Draw a scalar field as greyscale over the grid's area on the sheet. */
export function drawScalar(ctx: CanvasRenderingContext2D, f: ScalarField, v: View, ox: number, oy: number, mmPerPx: number, map = (t: number) => t * 255): void {
  const im = new ImageData(f.width, f.height);
  for (let i = 0; i < f.data.length; i++) {
    const g = map(f.data[i]);
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g;
    im.data[i * 4 + 3] = 255;
  }
  const t = new OffscreenCanvas(f.width, f.height);
  t.getContext("2d")!.putImageData(im, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(t, ox * v.pxPerMm, oy * v.pxPerMm, f.width * mmPerPx * v.pxPerMm, f.height * mmPerPx * v.pxPerMm);
}

/** Orientation ticks on a coarse lattice. */
export function drawDirection(ctx: CanvasRenderingContext2D, f: DirectionField, v: View, ox: number, oy: number, mmPerPx: number, color: string): void {
  const W = f.width, H = f.height, step = Math.max(4, Math.round(Math.max(W, H) / 70)), len = step * 0.42 * mmPerPx * v.pxPerMm;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, v.pxPerMm * 0.3);
  ctx.beginPath();
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      const th = angleAt(f, (y | 0) * W + (x | 0));
      const cx = (ox + x * mmPerPx) * v.pxPerMm, cy = (oy + y * mmPerPx) * v.pxPerMm, dx = Math.cos(th) * len, dy = Math.sin(th) * len;
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
    }
  }
  ctx.stroke();
}
