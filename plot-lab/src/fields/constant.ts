import type { DirectionField, Grid, ScalarField } from "../core/fields";

export function constantScalar(grid: Grid, value: number): ScalarField {
  return { width: grid.width, height: grid.height, data: new Float32Array(grid.width * grid.height).fill(value) };
}

/** Every line at the same angle (degrees, 0 = horizontal, clockwise on screen). */
export function constantDirection(grid: Grid, angle: number): DirectionField {
  const n = grid.width * grid.height, a = (angle * Math.PI) / 90;
  return { width: grid.width, height: grid.height, c: new Float32Array(n).fill(Math.cos(a)), s: new Float32Array(n).fill(Math.sin(a)) };
}
