/**
 * Seeded pseudo-random number generation and distribution samplers used by the
 * Thompson-sampling traffic router. All samplers are deterministic for a given
 * seed, making Canary experiments reproducible.
 */

export type Rng = () => number

/** Mulberry32 — a small, fast, high-quality 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box–Muller transform. */
export function standardNormal(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gamma variate with shape >= 1 via the Marsaglia–Tsang method. */
export function gamma(rng: Rng, shape: number): number {
  if (shape < 1) throw new Error('gamma sampler requires shape >= 1')
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const x = standardNormal(rng)
    const v = (1 + c * x) ** 3
    if (v <= 0) continue
    const u = rng()
    if (u < 1 - 0.0331 * x ** 4) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Beta(alpha, beta) variate from two gamma variates (alpha, beta >= 1). */
export function beta(rng: Rng, alpha: number, betaShape: number): number {
  if (alpha < 1 || betaShape < 1) throw new Error('beta sampler requires alpha, beta >= 1')
  const x = gamma(rng, alpha)
  const y = gamma(rng, betaShape)
  return x / (x + y)
}
