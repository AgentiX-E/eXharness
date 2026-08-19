import { describe, expect, it } from 'vitest'
import { parsePositiveInt, parseSubjects, parseTrials } from '../src/commands/common.js'

describe('parsePositiveInt', () => {
  it('returns the fallback when the value is undefined', () => {
    expect(parsePositiveInt(undefined, 'x', 5)).toBe(5)
  })

  it('parses a positive integer', () => {
    expect(parsePositiveInt('7', 'x', 5)).toBe(7)
  })

  it('rejects non-positive or non-integer values', () => {
    expect(() => parsePositiveInt('0', 'x', 5)).toThrow(/positive integer/)
    expect(() => parsePositiveInt('-1', 'x', 5)).toThrow(/positive integer/)
    expect(() => parsePositiveInt('1.5', 'x', 5)).toThrow(/positive integer/)
  })
})

describe('parseTrials', () => {
  it('requires at least two trials', () => {
    expect(parseTrials('3', 5)).toBe(3)
    expect(() => parseTrials('1', 5)).toThrow(/>= 2/)
    expect(() => parseTrials('0', 5)).toThrow(/positive integer/)
  })
})

describe('parseSubjects', () => {
  it('returns the default subject set when undefined', () => {
    expect(parseSubjects(undefined)).toHaveLength(5)
    expect(parseSubjects(undefined)).toContain('abstract_algebra')
  })

  it('splits and trims a comma-separated list', () => {
    expect(parseSubjects('algebra, logic ,')).toEqual(['algebra', 'logic'])
  })

  it('rejects an empty list', () => {
    expect(() => parseSubjects(',,')).toThrow(/non-empty/)
  })
})
