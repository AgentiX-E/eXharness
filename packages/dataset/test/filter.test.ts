import { describe, expect, it } from 'vitest'
import { countWords, deduplicateStrings, isBlank, isValidEvolution, passesFilters } from '../src/index.js'

describe('isBlank', () => {
  it('detects empty and whitespace-only strings', () => {
    expect(isBlank('')).toBe(true)
    expect(isBlank('   \n\t')).toBe(true)
    expect(isBlank('hello')).toBe(false)
  })
})

describe('isValidEvolution', () => {
  it('accepts a clean rewrite', () => {
    expect(isValidEvolution('Craft a narrative about a service dog.')).toBe(true)
  })

  it('rejects blank output', () => {
    expect(isValidEvolution('')).toBe(false)
    expect(isValidEvolution('   ')).toBe(false)
  })

  it('rejects rewrites that leak forbidden placeholders', () => {
    expect(isValidEvolution('#Rewritten Prompt#: hello')).toBe(false)
    expect(isValidEvolution('hello #Given Prompt# world')).toBe(false)
    expect(isValidEvolution('#Created Prompt#: x')).toBe(false)
    expect(isValidEvolution('contains rewritten prompt')).toBe(false)
  })
})

describe('deduplicateStrings', () => {
  it('removes exact duplicates preserving first-seen order', () => {
    expect(deduplicateStrings(['a', 'b', 'a', 'c', ' b '])).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array for an empty input', () => {
    expect(deduplicateStrings([])).toEqual([])
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })
})

describe('passesFilters', () => {
  it('passes when no constraints are set', () => {
    expect(passesFilters('anything')).toBe(true)
  })

  it('enforces min and max character length', () => {
    expect(passesFilters('abcd', { minLength: 3, maxLength: 10 })).toBe(true)
    expect(passesFilters('ab', { minLength: 3 })).toBe(false)
    expect(passesFilters('abcdefghijk', { maxLength: 10 })).toBe(false)
  })

  it('enforces min and max word count', () => {
    expect(passesFilters('one two three', { minWords: 2, maxWords: 5 })).toBe(true)
    expect(passesFilters('one', { minWords: 2 })).toBe(false)
    expect(passesFilters('one two three four five six', { maxWords: 5 })).toBe(false)
  })

  it('rejects forbidden keywords case-insensitively', () => {
    expect(passesFilters('a harmless instruction', { forbiddenKeywords: ['bad'] })).toBe(true)
    expect(passesFilters('a BAD instruction', { forbiddenKeywords: ['bad'] })).toBe(false)
  })
})
