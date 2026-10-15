/** xorshift32 — the single seeded PRNG used by every algorithm. Never use Math.random() in geometry. */
export type Rng = () => number;

export function rng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
