import { describe, expect, it } from 'vitest'
import {
  Sprt,
  accuracy,
  bootstrapMeanCI,
  cohensD,
  confusionMatrix,
  correctnessArray,
  exactMatch,
  f1Score,
  hedgesG,
  lgamma,
  logLikelihoodRatio,
  mean,
  median,
  max,
  min,
  mulberry32,
  normalCdf,
  normalizeAnswer,
  pairedTTest,
  precision,
  quantile,
  recall,
  regularizedIncompleteBeta,
  sprtThresholds,
  std,
  studentsTTest,
  tTwoTailedPValue,
  underflowGuard,
  variance,
  welchTTest,
  mannWhitneyU,
} from '../src/index.js'

describe('special functions', () => {
  it('computes the regularized incomplete beta function', () => {
    expect(regularizedIncompleteBeta(1, 1, 0.5)).toBeCloseTo(0.5, 12)
    expect(regularizedIncompleteBeta(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 6)
    expect(regularizedIncompleteBeta(1, 1, 0)).toBe(0)
    expect(regularizedIncompleteBeta(1, 1, 1)).toBe(1)
    expect(() => regularizedIncompleteBeta(0, 1, 0.5)).toThrow(/positive/)
    expect(() => regularizedIncompleteBeta(1, 0, 0.5)).toThrow(/positive/)
  })

  it('remains stable (no throw) for extreme parameters that hit underflow guards', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 2000; i++) {
      const a = Math.pow(10, rng() * 300)
      const b = Math.pow(10, rng() * 300)
      const x = rng()
      const value = regularizedIncompleteBeta(a, b, x)
      if (Number.isFinite(value)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
    // A symmetric extreme case drives the continued fraction's initial term to
    // zero, exercising the FPMIN underflow guards. The final value may overflow
    // (inherent to double precision at a,b ~ 1e300), but it must not throw.
    expect(() => regularizedIncompleteBeta(1e300, 1e300, 0.5)).not.toThrow()
  })

  it('computes the two-tailed t p-value against reference critical values', () => {
    expect(tTwoTailedPValue(2.776, 4)).toBeCloseTo(0.05, 2)
    expect(tTwoTailedPValue(1.96, 1000)).toBeCloseTo(0.05, 2)
    expect(() => tTwoTailedPValue(1, 0)).toThrow(/positive/)
  })

  it('computes the standard normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })

  it('computes lgamma through the reflection branch for x < 0.5', () => {
    expect(lgamma(0.3)).toBeCloseTo(1.095798, 4)
    expect(lgamma(1)).toBeCloseTo(0, 10)
  })

  it('clamps values away from zero in underflowGuard', () => {
    expect(underflowGuard(0)).toBe(1e-300)
    expect(underflowGuard(1e-310)).toBe(1e-300)
    expect(underflowGuard(-1e-310)).toBe(1e-300)
    expect(underflowGuard(0.5)).toBe(0.5)
    expect(underflowGuard(-0.5)).toBe(-0.5)
    expect(underflowGuard(0, 1e-3)).toBe(1e-3)
  })
})

describe('descriptive statistics', () => {
  it('computes mean, variance, std', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9]
    expect(mean(values)).toBeCloseTo(5)
    expect(variance(values)).toBeCloseTo(4.571, 2)
    expect(std(values)).toBeCloseTo(Math.sqrt(4.571), 2)
  })

  it('computes median and quantiles', () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75)
    expect(quantile([1, 2, 3, 4], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4], 1)).toBe(4)
  })

  it('rejects empty samples and invalid quantiles', () => {
    expect(() => mean([])).toThrow()
    expect(() => quantile([], 0.5)).toThrow(/empty/)
    expect(() => quantile([1], -0.1)).toThrow(/\[0, 1\]/)
  })

  it('computes min and max and rejects empty samples', () => {
    expect(min([3, 1, 2])).toBe(1)
    expect(max([3, 1, 2])).toBe(3)
    expect(() => min([])).toThrow(/empty/)
    expect(() => max([])).toThrow(/empty/)
  })

  it('rejects variance when n <= ddof', () => {
    expect(() => variance([1])).toThrow(/more observations/)
    expect(() => variance([])).toThrow()
  })

  it('handles an integer quantile position without interpolation', () => {
    expect(quantile([1, 2, 3, 4], 1 / 3)).toBe(2)
  })
})

describe('hypothesis tests', () => {
  it('Welch t-test detects a clear mean difference', () => {
    const result = welchTTest([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    expect(result.meanDifference).toBeCloseTo(-5)
    expect(Math.abs(result.statistic)).toBeCloseTo(5)
    expect(result.pValue).toBeLessThan(0.01)
  })

  it('Welch t-test returns a large p-value for identical samples', () => {
    const result = welchTTest([1, 2, 3], [1, 2, 3])
    expect(result.pValue).toBeCloseTo(1, 5)
  })

  it('paired t-test detects a systematic shift', () => {
    const result = pairedTTest([1, 2, 3, 4], [2, 3, 4, 5])
    expect(result.meanDifference).toBeCloseTo(-1)
    expect(result.pValue).toBeLessThan(0.05)
  })

  it('Cohen\'s d and Hedges\' g quantify effect size', () => {
    const d = cohensD([0, 1, 2], [3, 4, 5])
    expect(d).toBeCloseTo(-3)
    expect(Math.abs(cohensD([1, 2, 3], [1, 2, 3]))).toBe(0)
    expect(hedgesG([0, 1, 2], [3, 4, 5])).toBeCloseTo(-2.4, 10)
  })

  it('Mann-Whitney U detects complete separation', () => {
    const result = mannWhitneyU([1, 2, 3], [10, 11, 12])
    expect(result.u).toBe(0)
    expect(result.pValue).toBeLessThan(0.1)
  })

  it('Mann-Whitney U handles ties without error', () => {
    const result = mannWhitneyU([1, 1, 1], [1, 2, 3])
    expect(result.u).toBeGreaterThanOrEqual(0)
    expect(result.pValue).toBeGreaterThanOrEqual(0)
  })

  it('Mann-Whitney U returns zero z for all-identical samples', () => {
    const result = mannWhitneyU([1, 1, 1], [1, 1, 1])
    expect(result.u).toBeCloseTo(4.5, 10)
    expect(result.z).toBe(0)
    expect(result.pValue).toBeCloseTo(1, 6)
  })

  it('Student pooled t-test agrees with Welch on equal variances', () => {
    const result = studentsTTest([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    expect(result.meanDifference).toBeCloseTo(-5)
    expect(result.pValue).toBeLessThan(0.01)
    expect(result.pooledStd).toBeGreaterThan(0)
  })

  it('rejects empty samples in hypothesis tests', () => {
    expect(() => welchTTest([], [1])).toThrow(/non-empty/)
    expect(() => studentsTTest([], [1])).toThrow(/non-empty/)
    expect(() => pairedTTest([1, 2], [1])).toThrow(/equal length/)
    expect(() => pairedTTest([], [])).toThrow(/empty/)
  })

  it('returns zero Cohen\'s d for identical zero-variance samples', () => {
    expect(cohensD([1, 1, 1], [1, 1, 1])).toBe(0)
  })
})

describe('bootstrap', () => {
  it('estimates the mean and produces a CI containing the estimate', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const ci = bootstrapMeanCI(values, { iterations: 500, seed: 42 })
    expect(ci.estimate).toBeCloseTo(5.5)
    expect(ci.lower).toBeLessThanOrEqual(ci.estimate)
    expect(ci.upper).toBeGreaterThanOrEqual(ci.estimate)
  })

  it('uses a default seed when none is supplied', () => {
    const ci = bootstrapMeanCI([1, 2, 3])
    expect(ci.estimate).toBeCloseTo(2)
    expect(ci.lower).toBeLessThanOrEqual(ci.estimate)
    expect(ci.upper).toBeGreaterThanOrEqual(ci.estimate)
  })

  it('mulberry32 is deterministic for a fixed seed', () => {
    const a = mulberry32(1)
    const b = mulberry32(1)
    expect(a()).toBe(b())
  })

  it('rejects empty samples', () => {
    expect(() => bootstrapMeanCI([])).toThrow(/empty/)
  })

  it('rejects invalid iterations and confidence', () => {
    expect(() => bootstrapMeanCI([1], { iterations: 0 })).toThrow(/positive integer/)
    expect(() => bootstrapMeanCI([1], { iterations: 1.5 })).toThrow(/positive integer/)
    expect(() => bootstrapMeanCI([1], { confidence: 0 })).toThrow(/\(0, 1\)/)
    expect(() => bootstrapMeanCI([1], { confidence: 1 })).toThrow(/\(0, 1\)/)
  })
})

describe('metrics', () => {
  it('computes accuracy', () => {
    expect(accuracy([1, 2, 3], [1, 2, 4])).toBeCloseTo(2 / 3)
    expect(() => accuracy([1], [1, 2])).toThrow(/equal length/)
  })

  it('computes exact match with normalization', () => {
    expect(exactMatch('Hello', ' hello ')).toBe(true)
    expect(exactMatch('Hello', 'hello', { normalize: false })).toBe(false)
  })

  it('normalizeAnswer respects its options', () => {
    expect(normalizeAnswer(' A  B ')).toBe('a b')
    expect(normalizeAnswer(' A  B ', { collapseWhitespace: false })).toBe(' a  b ')
    expect(normalizeAnswer('ABC', { lowercase: false })).toBe('ABC')
  })

  it('precision and recall return 0 for zero denominators', () => {
    expect(precision(0, 0)).toBe(0)
    expect(recall(0, 0)).toBe(0)
  })

  it('computes precision, recall and F1', () => {
    expect(precision(2, 1)).toBeCloseTo(2 / 3)
    expect(recall(2, 1)).toBeCloseTo(2 / 3)
    expect(f1Score(2, 1, 1)).toBeCloseTo(2 / 3)
  })

  it('computes a confusion matrix', () => {
    expect(confusionMatrix([true, true, false, false], [true, false, true, false])).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      trueNegatives: 1,
    })
  })

  it('computes per-sample correctness', () => {
    expect(correctnessArray([1, 2, 3], [1, 5, 3])).toEqual([1, 0, 1])
    expect(() => correctnessArray([1], [1, 2])).toThrow(/equal length/)
  })
})

describe('SPRT', () => {
  it('computes the log-likelihood ratio', () => {
    expect(logLikelihoodRatio(1, 0, 0.5, 0.6)).toBeCloseTo(Math.log(1.2), 10)
  })

  it('computes Wald thresholds', () => {
    const { upper, lower } = sprtThresholds(0.05, 0.2)
    expect(upper).toBeCloseTo(Math.log(16), 10)
    expect(lower).toBeCloseTo(Math.log(0.2 / 0.95), 10)
  })

  it('accepts the alternative after enough successes', () => {
    const sprt = new Sprt({ p0: 0.5, p1: 0.8, alpha: 0.05, beta: 0.2 })
    let decision = sprt.observe(true)
    let n = 1
    while (decision === 'continue' && n < 100) {
      decision = sprt.observe(true)
      n++
    }
    expect(sprt.decision()).toBe('accept-alternative')
    expect(sprt.state.successes).toBeGreaterThan(0)
  })

  it('accepts the null after enough failures', () => {
    const sprt = new Sprt({ p0: 0.8, p1: 0.95, alpha: 0.05, beta: 0.2 })
    let decision = sprt.observe(false)
    let n = 1
    while (decision === 'continue' && n < 200) {
      decision = sprt.observe(false)
      n++
    }
    expect(sprt.decision()).toBe('accept-null')
  })

  it('rejects invalid rates and error probabilities', () => {
    expect(() => logLikelihoodRatio(0, 0, 0, 0.5)).toThrow(/p0/)
    expect(() => logLikelihoodRatio(0, 0, 0.5, 1)).toThrow(/p1/)
    expect(() => sprtThresholds(0, 0.2)).toThrow(/alpha/)
    expect(() => sprtThresholds(1, 0.2)).toThrow(/alpha/)
    expect(() => sprtThresholds(0.05, 0)).toThrow(/beta/)
    expect(() => sprtThresholds(0.05, 1)).toThrow(/beta/)
    expect(() => new Sprt({ p0: 0, p1: 0.5 })).toThrow(/p0/)
    expect(() => new Sprt({ p0: 0.5, p1: 1 })).toThrow(/p1/)
  })

  it('stays sticky once a terminal decision is reached', () => {
    const sprt = new Sprt({ p0: 0.5, p1: 0.9, alpha: 0.05, beta: 0.2 })
    let decision = sprt.observe(true)
    let n = 1
    while (decision === 'continue' && n < 100) {
      decision = sprt.observe(true)
      n++
    }
    expect(decision).toBe('accept-alternative')
    const before = sprt.state.successes
    sprt.observe(false)
    expect(sprt.state.successes).toBe(before)
    expect(sprt.decision()).toBe('accept-alternative')
  })
})
