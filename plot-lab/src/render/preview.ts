/** Canvas 2D preview renderer. Geometry is in mm; the caller's transform maps mm to device pixels. */
import type { PlotPath } from "../geometry/types";

export function pathsToPath2D(paths: PlotPath[]): Path2D {
  const p2 = new Path2D();
  for (const p of paths) {
    const pts = p.points;
    if (pts.length < 2) continue;
    p2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p2.lineTo(pts[i].x, pts[i].y);
    if (p.closed) p2.closePath();
  }
  return p2;
}

/** Each path tinted by its plot order, with pen-up moves as dashed lines. `px` = mm per device pixel. */
export function drawPathOrder(ctx: CanvasRenderingContext2D, paths: PlotPath[], penWidth: number, px: number): void {
  const n = paths.length;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(penWidth, px * 1.2);
  paths.forEach((p, i) => {
    ctx.strokeStyle = `hsl(${Math.round(200 + (i / Math.max(1, n - 1)) * 160)} 75% 45%)`;
    ctx.stroke(pathsToPath2D([p]));
  });
  ctx.strokeStyle = "rgba(230, 60, 60, 0.75)";
  ctx.lineWidth = px;
  ctx.setLineDash([px * 4, px * 3]);
  ctx.beginPath();
  let cx = 0, cy = 0;
  for (const p of paths) {
    const s = p.points[0];
    ctx.moveTo(cx, cy);
    ctx.lineTo(s.x, s.y);
    const e = p.closed ? s : p.points[p.points.length - 1];
    cx = e.x; cy = e.y;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
