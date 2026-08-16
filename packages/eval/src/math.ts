/**
 * Self-implemented special-function primitives used by the statistics layer:
 * the log-gamma function (Lanczos approximation) and the regularized
 * incomplete beta function (continued-fraction evaluation, after Numerical
 * Recipes). These give high-precision p-values without any runtime dependency.
 */

const LANCZOS_G = 7
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** Natural logarithm of the gamma function (Lanczos approximation). */
export function lgamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - lgamma(1 - x)
  }
  const z = x - 1
  let a = LANCZOS_C[0]!
  const t = z + LANCZOS_G + 0.5
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    a += LANCZOS_C[i]! / (z + i)
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

const BETACF_MAXIT = 200
const BETACF_EPS = 3e-14
const BETACF_FPMIN = 1e-300

/**
 * Clamp a value away from zero to prevent reciprocal underflow/overflow in the
 * continued-fraction evaluation. Extracted so the defensive branch is directly
 * testable (it only triggers at double-precision underflow boundaries).
 */
export function underflowGuard(x: number, min: number = BETACF_FPMIN): number {
  return Math.abs(x) < min ? min : x
}

function betacf(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = underflowGuard(1 - (qab * x) / qap)
  d = 1 / d
  let h = d
  for (let m = 1; m <= BETACF_MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    d = underflowGuard(d)
    c = 1 + aa / c
    c = underflowGuard(c)
    d = 1 / d
    h *= d * c

    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    d = underflowGuard(d)
    c = 1 + aa / c
    c = underflowGuard(c)
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < BETACF_EPS) break
  }
  return h
}

/**
 * Regularized incomplete beta function I_x(a, b), in [0, 1].
 * Accurate to roughly 1e-14 relative error across the domain.
 */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (a <= 0 || b <= 0) throw new Error('a and b must be positive')
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a
  return 1 - (bt * betacf(b, a, 1 - x)) / b
}

/**
 * Two-tailed p-value of Student's t distribution: P(|T| > t) for T ~ t(df).
 * Uses the identity P(|T| > t) = I_{df/(df+t²)}(df/2, 1/2).
 */
export function tTwoTailedPValue(t: number, df: number): number {
  if (df <= 0) throw new Error('degrees of freedom must be positive')
  const x = df / (df + t * t)
  return regularizedIncompleteBeta(df / 2, 0.5, x)
}

/** Standard normal CDF via the error function (Abramowitz–Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2)
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}
