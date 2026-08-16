import { describe, expect, it } from 'vitest'
import { cohensKappa, kappa } from '../src/kappa.js'

function repeat(label: string, count: number): string[] {
  return new Array<string>(count).fill(label)
}

describe('cohensKappa', () => {
  it('returns 1 for perfect agreement', () => {
    const a = ['x', 'y', 'x', 'y', 'z']
    const b = ['x', 'y', 'x', 'y', 'z']
    const result = cohensKappa(a, b)
    expect(result.kappa).toBeCloseTo(1, 10)
    expect(result.observedAgreement).toBeCloseTo(1, 10)
  })

  it('matches a known reference value (κ = 0.5)', () => {
    const a = [...repeat('yes', 35), ...repeat('yes', 15), ...repeat('no', 10), ...repeat('no', 40)]
    const b = [...repeat('yes', 35), ...repeat('no', 15), ...repeat('yes', 10), ...repeat('no', 40)]
    const result = cohensKappa(a, b)
    expect(result.observedAgreement).toBeCloseTo(0.75, 10)
    expect(result.expectedAgreement).toBeCloseTo(0.5, 10)
    expect(result.kappa).toBeCloseTo(0.5, 10)
    expect(result.n).toBe(100)
    expect(result.categories).toBe(2)
  })

  it('returns 0 for agreement no better than chance', () => {
    // Two raters with orthogonal, perfectly independent labels.
    const a = ['a', 'a', 'b', 'b']
    const b = ['a', 'b', 'a', 'b']
    const result = cohensKappa(a, b)
    expect(result.observedAgreement).toBeCloseTo(0.5, 10)
    expect(result.expectedAgreement).toBeCloseTo(0.5, 10)
    expect(result.kappa).toBeCloseTo(0, 10)
  })

  it('handles the single-category degenerate case as perfect agreement', () => {
    const result = cohensKappa(['a', 'a', 'a'], ['a', 'a', 'a'])
    expect(result.kappa).toBe(1)
  })

  it('handles categories present in only one rater', () => {
    const a = ['a', 'a', 'b', 'b']
    const b = ['a', 'c', 'b', 'c']
    const result = cohensKappa(a, b)
    expect(result.categories).toBe(3)
    expect(result.kappa).toBeGreaterThanOrEqual(-1)
    expect(result.kappa).toBeLessThanOrEqual(1)
  })

  it('throws on length mismatch and empty samples', () => {
    expect(() => cohensKappa(['a'], ['a', 'b'])).toThrow(/length mismatch/)
    expect(() => cohensKappa([], [])).toThrow(/empty/)
  })

  it('exposes the coefficient-only helper', () => {
    expect(kappa(['a', 'a'], ['a', 'a'])).toBeCloseTo(1, 10)
  })
})
