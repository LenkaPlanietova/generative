/** A polyline as interleaved coordinates [x0, y0, x1, y1, …]. */
export type Path = Float32Array;

export function pathLength(p: Path): number {
  let l = 0;
  for (let j = 2; j < p.length; j += 2) l += Math.hypot(p[j] - p[j - 2], p[j + 1] - p[j - 1]);
  return l;
}

/** Map grid-px paths to sheet millimetres. */
export function gridToMm(paths: Path[], mmPerPx: number, ox: number, oy: number): Path[] {
  return paths.map((p) => {
    const out = new Float32Array(p.length);
    for (let j = 0; j < p.length; j += 2) {
      out[j] = ox + p[j] * mmPerPx;
      out[j + 1] = oy + p[j + 1] * mmPerPx;
    }
    return out;
  });
}
