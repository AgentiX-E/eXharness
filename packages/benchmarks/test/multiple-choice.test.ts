import { describe, expect, it } from 'vitest'
import { MultipleChoiceScorer, extractChoiceLetter } from '../src/index.js'

const choices = [
  'The first pharyngeal arch',
  'The first and second pharyngeal arches',
  'The second pharyngeal arch',
  'The second and third pharyngeal arches',
]

describe('extractChoiceLetter', () => {
  it('extracts common answer formats', () => {
    expect(extractChoiceLetter('A')).toBe('A')
    expect(extractChoiceLetter('B')).toBe('B')
    expect(extractChoiceLetter('(C)')).toBe('C')
    expect(extractChoiceLetter('D.')).toBe('D')
    expect(extractChoiceLetter('A. The first pharyngeal arch')).toBe('A')
    expect(extractChoiceLetter('B: some text')).toBe('B')
    expect(extractChoiceLetter('C)')).toBe('C')
    expect(extractChoiceLetter('  D, foo')).toBe('D')
  })

  it('falls back to matching the full choice text', () => {
    expect(extractChoiceLetter('The second and third pharyngeal arches', { choices })).toBe('D')
    expect(extractChoiceLetter('I think it is the second pharyngeal arch', { choices })).toBe('C')
  })

  it('returns null for unparseable output', () => {
    expect(extractChoiceLetter('')).toBeNull()
    expect(extractChoiceLetter('hello world')).toBeNull()
    expect(extractChoiceLetter('E')).toBeNull()
  })

  it('honours a custom letter set', () => {
    expect(extractChoiceLetter('X', { letters: ['X', 'Y'] })).toBe('X')
    expect(extractChoiceLetter('(Y)', { letters: ['X', 'Y'] })).toBe('Y')
  })
})

describe('MultipleChoiceScorer', () => {
  it('scores a correct letter match', () => {
    const scorer = new MultipleChoiceScorer()
    const result = scorer.score({ id: 's1', input: 'q', reference: 'D', metadata: { choices } }, 'D')
    expect(result.correct).toBe(true)
    expect(result.score).toBe(1)
    expect(result.details).toEqual({ extracted: 'D', expected: 'D' })
  })

  it('scores an incorrect letter match', () => {
    const scorer = new MultipleChoiceScorer()
    const result = scorer.score({ id: 's1', input: 'q', reference: 'A', metadata: { choices } }, 'B')
    expect(result.correct).toBe(false)
    expect(result.score).toBe(0)
  })

  it('scores a full choice-text answer', () => {
    const scorer = new MultipleChoiceScorer()
    const result = scorer.score(
      { id: 's1', input: 'q', reference: 'D', metadata: { choices } },
      'The second and third pharyngeal arches',
    )
    expect(result.correct).toBe(true)
  })
})
