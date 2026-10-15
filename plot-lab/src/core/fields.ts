/**
 * Shared field types (SPEC_ADDENDUM §B). Algorithms consume fields; field sources produce them.
 * Both live on a grid of `width × height` cells that covers the drawing area.
 */

/** Sign-free orientation in double-angle form: θ = ½·atan2(s, c). */
export interface DirectionField {
  width: number;
  height: number;
  c: Float32Array;
  s: Float32Array;
}

/** Values in 0..1 — tone (0 = black, 1 = white), density, depth, … */
export interface ScalarField {
  width: number;
  height: number;
  data: Float32Array;
}

/**
 * The working grid. Every parameter in the app is in millimetres; this is the one place
 * where millimetres become grid pixels.
 */
export interface Grid {
  width: number;
  height: number;
  mmPerPx: number;
}

export const px = (grid: Grid, mm: number): number => mm / grid.mmPerPx;

export function scalarField(grid: Grid, data?: Float32Array): ScalarField {
  return { width: grid.width, height: grid.height, data: data ?? new Float32Array(grid.width * grid.height) };
}

export function sameSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return a.width === b.width && a.height === b.height;
}

/** Bilinear sample at grid coordinates (clamped to the grid). */
export function sample(a: Float32Array, W: number, H: number, x: number, y: number): number {
  x = x < 0 ? 0 : x > W - 1.001 ? W - 1.001 : x;
  y = y < 0 ? 0 : y > H - 1.001 ? H - 1.001 : y;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + W] * (1 - fx) + a[i + W + 1] * fx) * fy;
}

/** Orientation angle (radians, −π/2..π/2) of a direction field at a cell. */
export function angleAt(f: DirectionField, i: number): number {
  return 0.5 * Math.atan2(f.s[i], f.c[i]);
}
