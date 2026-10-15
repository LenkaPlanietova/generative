import { useEffect, useRef } from "react";
import type { GeometryCollection } from "../../geometry/types";
import { pathsToPath2D } from "../../render/preview";

/** Small render of real generated geometry. */
export function Thumbnail({ geometry, size = 52 }: { geometry?: GeometryCollection; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext("2d")!;
    cv.width = cv.height = size * dpr;
    ctx.fillStyle = "#f4f3ef";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (!geometry) return;
    const k = (size * dpr) / Math.max(geometry.widthMm, geometry.heightMm);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 0.45 / k;
    ctx.stroke(pathsToPath2D(geometry.paths));
  }, [geometry, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0 rounded-sm" aria-hidden />;
}
