/** Gaussian blur approximated by three box blurs (separable, O(n) per pass). Sigma in grid px. */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function boxRadii(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const r: number[] = [];
  for (let i = 0; i < n; i++) r.push(((i < m ? wl : wu) - 1) / 2);
  return r;
}

function boxH(s: Float32Array, d: Float32Array, W: number, H: number, r: number): void {
  r = Math.round(r);
  if (r < 1) { d.set(s); return; }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let a = 0;
    for (let i = -r - 1; i <= r - 1; i++) a += s[o + clamp(i, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      a += s[o + Math.min(x + r, W - 1)] - s[o + Math.max(x - r - 1, 0)];
      d[o + x] = a * k;
    }
  }
}

function boxV(s: Float32Array, d: Float32Array, W: number, H: number, r: number): void {
  r = Math.round(r);
  if (r < 1) { d.set(s); return; }
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r - 1; i <= r - 1; i++) a += s[clamp(i, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      a += s[Math.min(y + r, H - 1) * W + x] - s[Math.max(y - r - 1, 0) * W + x];
      d[y * W + x] = a * k;
    }
  }
}

export function blur(src: Float32Array, W: number, H: number, sigma: number): Float32Array {
  const a = Float32Array.from(src);
  if (sigma < 0.35) return a;
  const b = new Float32Array(W * H);
  for (const r of boxRadii(sigma, 3)) {
    boxH(a, b, W, H, r);
    boxV(b, a, W, H, r);
  }
  return a;
}
