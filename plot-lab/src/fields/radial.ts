import { type Grid, type ScalarField, px } from "../core/fields";

export interface RadialOptions {
  /** Tone at the centre and at `radius` and beyond (0 = black, 1 = white). */
  centreTone: number;
  edgeTone: number;
  /** mm */
  radius: number;
  /** Centre in mm, relative to the drawing area's top-left. Defaults to the middle. */
  cx?: number;
  cy?: number;
}

/** Radial tone gradient with a smoothstep falloff. */
export function radialGradient(grid: Grid, o: RadialOptions): ScalarField {
  const { width: W, height: H } = grid, data = new Float32Array(W * H);
  const cx = o.cx === undefined ? W / 2 : px(grid, o.cx), cy = o.cy === undefined ? H / 2 : px(grid, o.cy);
  const R = Math.max(1e-6, px(grid, o.radius));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / R), k = t * t * (3 - 2 * t);
      data[y * W + x] = o.centreTone + (o.edgeTone - o.centreTone) * k;
    }
  }
  return { width: W, height: H, data };
}
