import { describe, expect, it } from 'vitest'
import { HyperBand } from '../src/hyperband.js'

describe('HyperBand construction', () => {
  it('rejects invalid budgets and eta', () => {
    expect(() => new HyperBand({ minBudget: 0, maxBudget: 10 })).toThrow(/positive finite/)
    expect(() => new HyperBand({ minBudget: 10, maxBudget: 5 })).toThrow(/>= minBudget/)
    expect(() => new HyperBand({ minBudget: 1, maxBudget: 10, eta: 1 })).toThrow(/> 1/)
    expect(() => new HyperBand({ minBudget: 1, maxBudget: 10, eta: 0.5 })).toThrow(/> 1/)
  })

  it('computes sMax as floor(log_eta(max/min))', () => {
    expect(new HyperBand({ minBudget: 1, maxBudget: 81, eta: 3 }).sMax).toBe(4)
    expect(new HyperBand({ minBudget: 1, maxBudget: 27, eta: 3 }).sMax).toBe(3)
    expect(new HyperBand({ minBudget: 1, maxBudget: 1, eta: 3 }).sMax).toBe(0)
  })
})

describe('HyperBand brackets', () => {
  it('generates the canonical R=81, eta=3 bracket schedule', () => {
    const hb = new HyperBand({ minBudget: 1, maxBudget: 81, eta: 3 })
    const brackets = hb.brackets()
    expect(brackets).toEqual([
      { s: 4, initialConfigs: 81, initialBudget: 1 },
      { s: 3, initialConfigs: 34, initialBudget: 3 },
      { s: 2, initialConfigs: 15, initialBudget: 9 },
      { s: 1, initialConfigs: 8, initialBudget: 27 },
      { s: 0, initialConfigs: 5, initialBudget: 81 },
    ])
  })

  it('rejects out-of-range bracket indices', () => {
    const hb = new HyperBand({ minBudget: 1, maxBudget: 81, eta: 3 })
    expect(() => hb.bracket(-1)).toThrow(/integer in \[0, 4\]/)
    expect(() => hb.bracket(5)).toThrow(/integer in \[0, 4\]/)
    expect(() => hb.bracket(1.5)).toThrow(/integer in \[0, 4\]/)
  })
})

describe('HyperBand budget sequences', () => {
  it('returns geometrically increasing budgets ending at maxBudget', () => {
    const hb = new HyperBand({ minBudget: 1, maxBudget: 81, eta: 3 })
    expect(hb.budgetSequence(4)).toEqual([1, 3, 9, 27, 81])
    expect(hb.budgetSequence(0)).toEqual([81])
    expect(hb.rounds(4)).toBe(5)
    expect(hb.rounds(0)).toBe(1)
  })

  it('topConfigs keeps floor(n/eta) with a floor of 1', () => {
    expect(HyperBand.topConfigs(81, 3)).toBe(27)
    expect(HyperBand.topConfigs(2, 3)).toBe(1)
    expect(HyperBand.topConfigs(1, 3)).toBe(1)
  })
})
