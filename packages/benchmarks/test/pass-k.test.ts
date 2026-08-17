import { describe, expect, it } from 'vitest'
import { passAtK, passAtKFromOutputs } from '../src/index.js'

describe('passAtK', () => {
  it('computes known values', () => {
    expect(passAtK(1, 1, 1)).toBe(1)
    expect(passAtK(1, 0, 1)).toBe(0)
    expect(passAtK(100, 50, 1)).toBeCloseTo(0.5)
  })

  it('returns 1 when fewer than k samples are incorrect', () => {
    expect(passAtK(10, 8, 5)).toBe(1) // n - c = 2 < 5
    expect(passAtK(5, 5, 3)).toBe(1)
  })

  it('increases monotonically with k', () => {
    const n = 20
    const c = 12
    let prev = 0
    for (let k = 1; k <= 10; k++) {
      const v = passAtK(n, c, k)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('rejects invalid arguments', () => {
    expect(() => passAtK(0, 0, 1)).toThrow(/n must be >= 1/)
    expect(() => passAtK(5, -1, 1)).toThrow(/c must be in \[0, n\]/)
    expect(() => passAtK(5, 6, 1)).toThrow(/c must be in \[0, n\]/)
    expect(() => passAtK(5, 0, 0)).toThrow(/k must be >= 1/)
    expect(() => passAtK(5, 0, 6)).toThrow(/k must be <= n/)
    expect(() => passAtK(5.5, 1, 1)).toThrow(/must be integers/)
  })

  it('matches the naive estimator on small cases', () => {
    // Brute-force C(n,c) with integers for a small sanity check.
    const comb = (n: number, k: number): number => {
      if (k < 0 || k > n) return 0
      let r = 1
      for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
      return r
    }
    for (const [n, c, k] of [
      [6, 3, 2],
      [7, 5, 3],
      [5, 2, 1],
    ] as const) {
      const expected = 1 - comb(n - c, k) / comb(n, k)
      expect(passAtK(n, c, k)).toBeCloseTo(expected, 12)
    }
  })
})

describe('passAtKFromOutputs', () => {
  it('counts correct outputs and delegates to passAtK', () => {
    expect(passAtKFromOutputs([true, true, false, false], 1)).toBeCloseTo(0.5)
    expect(passAtKFromOutputs([true, true, true, true], 2)).toBe(1)
  })
})
