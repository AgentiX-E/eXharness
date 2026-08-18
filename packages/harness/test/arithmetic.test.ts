import { describe, expect, it } from 'vitest'
import { evaluateArithmetic } from '../src/arithmetic.js'

describe('evaluateArithmetic', () => {
  it('evaluates integer literals and decimals', () => {
    expect(evaluateArithmetic('42')).toBe(42)
    expect(evaluateArithmetic('3.14')).toBeCloseTo(3.14)
    expect(evaluateArithmetic(' 0 ')).toBe(0)
  })

  it('honours operator precedence (* and / before + and -)', () => {
    expect(evaluateArithmetic('2 + 3 * 4')).toBe(14)
    expect(evaluateArithmetic('2 * 3 + 4')).toBe(10)
    expect(evaluateArithmetic('10 - 4 / 2')).toBe(8)
  })

  it('supports parentheses and unary signs', () => {
    expect(evaluateArithmetic('(2 + 3) * 4')).toBe(20)
    expect(evaluateArithmetic('-2 + 3')).toBe(1)
    expect(evaluateArithmetic('2 * -3')).toBe(-6)
    expect(evaluateArithmetic('2 - (-3)')).toBe(5)
    expect(evaluateArithmetic('+2 + 3')).toBe(5)
    expect(evaluateArithmetic('2 + +3')).toBe(5)
  })

  it('ignores surrounding and internal whitespace', () => {
    expect(evaluateArithmetic('  2   +   3  ')).toBe(5)
    expect(evaluateArithmetic('( 2 + 3 ) * 4')).toBe(20)
  })

  it('supports chained left-associative operations', () => {
    expect(evaluateArithmetic('20 / 5 / 2')).toBe(2)
    expect(evaluateArithmetic('1 + 2 + 3 + 4')).toBe(10)
  })

  it('rejects division by zero', () => {
    expect(() => evaluateArithmetic('1 / 0')).toThrow(/division by zero/)
    expect(() => evaluateArithmetic('1 / (2 - 2)')).toThrow(/division by zero/)
  })

  it('rejects empty and malformed expressions', () => {
    expect(() => evaluateArithmetic('')).toThrow()
    expect(() => evaluateArithmetic('   ')).toThrow()
    expect(() => evaluateArithmetic('2 +')).toThrow()
    expect(() => evaluateArithmetic('2 + * 3')).toThrow()
    expect(() => evaluateArithmetic('(2 + 3')).toThrow(/expected "\)"/)
    expect(() => evaluateArithmetic('2 + 3)')).toThrow()
    expect(() => evaluateArithmetic('abc')).toThrow()
    expect(() => evaluateArithmetic('2 ** 3')).toThrow()
    expect(() => evaluateArithmetic('2 3')).toThrow()
    expect(() => evaluateArithmetic('9'.repeat(400))).toThrow(/invalid number/)
  })
})
