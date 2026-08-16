import { normalCdf, tTwoTailedPValue } from './math.js'

/** Arithmetic mean of a non-empty sample. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean of empty sample')
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * Variance via Welford's online algorithm for numerical stability.
 * `ddof` (delta degrees of freedom) is 1 for the unbiased sample variance
 * and 0 for the population variance.
 */
export function variance(values: readonly number[], ddof = 1): number {
  const n = values.length
  if (n <= ddof) throw new Error('variance requires more observations than ddof')
  let m = 0
  let s = 0
  let k = 0
  for (const v of values) {
    k++
    const delta = v - m
    m += delta / k
    s += delta * (v - m)
  }
  return s / (n - ddof)
}

export function std(values: readonly number[], ddof = 1): number {
  return Math.sqrt(variance(values, ddof))
}

export function min(values: readonly number[]): number {
  if (values.length === 0) throw new Error('min of empty sample')
  return Math.min(...values)
}

export function max(values: readonly number[]): number {
  if (values.length === 0) throw new Error('max of empty sample')
  return Math.max(...values)
}

/** Median (50th percentile), linear-interpolated. */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5)
}

/**
 * Quantile with linear interpolation (matches NumPy `linear` / type-7).
 * `q` is a probability in [0, 1].
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new Error('quantile of empty sample')
  if (q < 0 || q > 1) throw new Error('quantile q must be in [0, 1]')
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  const weight = pos - lo
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight
}

export interface TTestResult {
  statistic: number
  degreesOfFreedom: number
  pValue: number
  meanDifference: number
  /** Pooled standard deviation (effect-size denominator), when defined. */
  pooledStd?: number
}

function guardTwoSamples(a: readonly number[], b: readonly number[], test: string): void {
  if (a.length === 0 || b.length === 0) throw new Error(`${test}: both samples must be non-empty`)
}

/**
 * Welch's t-test (unequal variances, the recommended default). Two-tailed.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): TTestResult {
  guardTwoSamples(a, b, 'welchTTest')
  const ma = mean(a)
  const mb = mean(b)
  const va = variance(a)
  const vb = variance(b)
  const na = a.length
  const nb = b.length
  const se2 = va / na + vb / nb
  const t = (ma - mb) / Math.sqrt(se2)
  const df = se2 * se2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
  return {
    statistic: t,
    degreesOfFreedom: df,
    pValue: tTwoTailedPValue(Math.abs(t), df),
    meanDifference: ma - mb,
  }
}

/** Student's pooled t-test (equal variances). Two-tailed. */
export function studentsTTest(a: readonly number[], b: readonly number[]): TTestResult {
  guardTwoSamples(a, b, 'studentsTTest')
  const ma = mean(a)
  const mb = mean(b)
  const va = variance(a)
  const vb = variance(b)
  const na = a.length
  const nb = b.length
  const pooled = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2)
  const t = (ma - mb) / Math.sqrt(pooled * (1 / na + 1 / nb))
  const df = na + nb - 2
  return {
    statistic: t,
    degreesOfFreedom: df,
    pValue: tTwoTailedPValue(Math.abs(t), df),
    meanDifference: ma - mb,
    pooledStd: Math.sqrt(pooled),
  }
}

/** Paired t-test on matched observations (equal length). Two-tailed. */
export function pairedTTest(a: readonly number[], b: readonly number[]): TTestResult {
  if (a.length !== b.length) throw new Error('pairedTTest: samples must have equal length')
  if (a.length === 0) throw new Error('pairedTTest: empty sample')
  const diffs = a.map((v, i) => v - b[i]!)
  const md = mean(diffs)
  const sd = std(diffs)
  const t = md / (sd / Math.sqrt(diffs.length))
  const df = diffs.length - 1
  return {
    statistic: t,
    degreesOfFreedom: df,
    pValue: tTwoTailedPValue(Math.abs(t), df),
    meanDifference: md,
  }
}

/**
 * Cohen's d effect size (pooled standard deviation denominator).
 * |d| ≈ 0.2 small, 0.5 medium, 0.8 large.
 */
export function cohensD(a: readonly number[], b: readonly number[]): number {
  guardTwoSamples(a, b, 'cohensD')
  const na = a.length
  const nb = b.length
  const va = variance(a)
  const vb = variance(b)
  const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2))
  if (pooled === 0) return 0
  return (mean(a) - mean(b)) / pooled
}

/** Hedges' g: Cohen's d with a small-sample bias correction. */
export function hedgesG(a: readonly number[], b: readonly number[]): number {
  const d = cohensD(a, b)
  const n = a.length + b.length
  const correction = 1 - 3 / (4 * n - 9)
  return d * correction
}

export interface MannWhitneyResult {
  u: number
  z: number
  pValue: number
}

function ranks(values: readonly number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
  const result = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) result[indexed[k]!.i] = avgRank
    i = j + 1
  }
  return result
}

/** Mann–Whitney U test (two-tailed, normal approximation with tie correction). */
export function mannWhitneyU(a: readonly number[], b: readonly number[]): MannWhitneyResult {
  guardTwoSamples(a, b, 'mannWhitneyU')
  const n1 = a.length
  const n2 = b.length
  const combined = [...a, ...b]
  const r = ranks(combined)
  const r1 = r.slice(0, n1)
  const r2 = r.slice(n1)
  const sum1 = r1.reduce((s, v) => s + v, 0)
  const sum2 = r2.reduce((s, v) => s + v, 0)
  const u1 = sum1 - (n1 * (n1 + 1)) / 2
  const u2 = sum2 - (n2 * (n2 + 1)) / 2
  const u = Math.min(u1, u2)
  const n = n1 + n2

  // Tie correction for the variance of U.
  const counts = new Map<number, number>()
  for (const v of combined) counts.set(v, (counts.get(v) ?? 0) + 1)
  let tieCorrection = 0
  for (const count of counts.values()) tieCorrection += count * (count * count - 1)

  const meanU = (n1 * n2) / 2
  const varianceU = (n1 * n2 / 12) * (n + 1 - tieCorrection / (n * (n - 1)))
  const z = varianceU === 0 ? 0 : (u - meanU) / Math.sqrt(varianceU)
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  return { u, z, pValue }
}

export interface ConfidenceInterval {
  estimate: number
  lower: number
  upper: number
  confidence: number
}

/** Percentile bootstrap confidence interval for the mean (default 95%). */
export function bootstrapMeanCI(
  values: readonly number[],
  options: { iterations?: number; confidence?: number; seed?: number } = {},
): ConfidenceInterval {
  const { iterations = 2000, confidence = 0.95 } = options
  if (values.length === 0) throw new Error('bootstrapMeanCI: empty sample')
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('bootstrapMeanCI: iterations must be a positive integer')
  }
  if (!(confidence > 0 && confidence < 1)) {
    throw new Error('bootstrapMeanCI: confidence must be in (0, 1)')
  }
  const estimate = mean(values)
  const means = new Array<number>(iterations)
  const rand = mulberry32(options.seed ?? 0xc0ffee)
  for (let it = 0; it < iterations; it++) {
    let sum = 0
    for (let i = 0; i < values.length; i++) {
      sum += values[Math.floor(rand() * values.length)]!
    }
    means[it] = sum / values.length
  }
  means.sort((a, b) => a - b)
  const alpha = (1 - confidence) / 2
  // With confidence in (0, 1) and iterations >= 1, both indices are guaranteed
  // to be within [0, iterations - 1], so the non-null assertions are sound.
  const lo = means[Math.floor(alpha * iterations)]!
  const hi = means[Math.ceil((1 - alpha) * iterations) - 1]!
  return { estimate, lower: lo, upper: hi, confidence }
}

/** Deterministic 32-bit PRNG (Mulberry32) for reproducible resampling. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
