import { describe, expect, it } from 'vitest'
import { NumericMatchScorer, extractNumber, numbersEqual } from '../src/index.js'

describe('extractNumber', () => {
  it('extracts integers, decimals and negatives', () => {
    expect(extractNumber('42')).toBe(42)
    expect(extractNumber('3.14')).toBe(3.14)
    expect(extractNumber('-7')).toBe(-7)
    expect(extractNumber('The answer is 42')).toBe(42)
  })

  it('strips thousands separators and takes the last number', () => {
    expect(extractNumber('1,000')).toBe(1000)
    expect(extractNumber('There are 3 cats and 42 dogs')).toBe(42)
  })

  it('returns null when no number is present', () => {
    expect(extractNumber('no numbers here')).toBeNull()
    expect(extractNumber('')).toBeNull()
  })
})

describe('numbersEqual', () => {
  it('compares within absolute and relative tolerance', () => {
    expect(numbersEqual(42, 42)).toBe(true)
    expect(numbersEqual(1.000000001, 1)).toBe(true)
    expect(numbersEqual(0.333333333, 1 / 3)).toBe(true)
    expect(numbersEqual(1, 2)).toBe(false)
  })

  it('treats zero specially via relative scale', () => {
    expect(numbersEqual(0, 1e-7)).toBe(true)
    expect(numbersEqual(0, 1e-3)).toBe(false)
  })
})

describe('NumericMatchScorer', () => {
  it('scores a numeric match', () => {
    const scorer = new NumericMatchScorer()
    const result = scorer.score({ id: 's1', input: 'q', reference: '42' }, 'The answer is 42.')
    expect(result.correct).toBe(true)
    expect(result.details).toEqual({ predicted: 42, expected: 42 })
  })

  it('scores a numeric mismatch', () => {
    const scorer = new NumericMatchScorer()
    expect(scorer.score({ id: 's1', input: 'q', reference: '42' }, '43').correct).toBe(false)
  })

  it('rejects an invalid tolerance', () => {
    expect(() => new NumericMatchScorer({ tolerance: -1 })).toThrow(/finite non-negative/)
  })
})
