import { describe, expect, it } from 'vitest'
import { InstructionFollowingScorer, checkInstruction, checkInstructions, instructionCheckers } from '../src/index.js'

describe('IFEval instruction checks', () => {
  it('keywords:existence requires every keyword', () => {
    const id = 'keywords:existence'
    expect(checkInstruction(id, 'The cat and dog', { keywords: ['cat', 'dog'] })).toBe(true)
    expect(checkInstruction(id, 'The cat', { keywords: ['cat', 'dog'] })).toBe(false)
  })

  it('keywords:forbidden_words rejects any forbidden whole word', () => {
    const id = 'keywords:forbidden_words'
    expect(checkInstruction(id, 'the quick fox', { forbidden_words: ['cat', 'dog'] })).toBe(true)
    expect(checkInstruction(id, 'the quick dog', { forbidden_words: ['cat', 'dog'] })).toBe(false)
  })

  it('keywords:frequency counts occurrences', () => {
    const id = 'keywords:frequency'
    expect(checkInstruction(id, 'apple apple apple', { keyword: 'apple', frequency: 3, relation: 'at least' })).toBe(
      true,
    )
    expect(checkInstruction(id, 'apple apple', { keyword: 'apple', frequency: 3, relation: 'at least' })).toBe(false)
    expect(checkInstruction(id, 'apple', { keyword: 'apple', frequency: 2, relation: 'less than' })).toBe(true)
    expect(checkInstruction(id, 'apple apple', { keyword: 'apple', frequency: 2, relation: 'equal' })).toBe(true)
    expect(checkInstruction(id, 'apple', { keyword: 'apple', frequency: 2, relation: 'equal' })).toBe(false)
    expect(checkInstruction(id, 'no bananas', { keyword: 'banana', frequency: 1, relation: 'less than' })).toBe(false)
    expect(checkInstruction(id, 'no fruit here', { keyword: 'banana', frequency: 1, relation: 'less than' })).toBe(true)
  })

  it('keywords:letter_frequency counts a single letter', () => {
    const id = 'keywords:letter_frequency'
    expect(checkInstruction(id, 'eee', { letter: 'e', frequency: 3, relation: 'at least' })).toBe(true)
    expect(checkInstruction(id, 'ee', { letter: 'e', frequency: 3, relation: 'at least' })).toBe(false)
  })

  it('length_constraints:number_words enforces word count', () => {
    const id = 'length_constraints:number_words'
    expect(checkInstruction(id, 'one two three four five', { num_words: 5, relation: 'at least' })).toBe(true)
    expect(checkInstruction(id, 'one two', { num_words: 5, relation: 'at least' })).toBe(false)
    expect(checkInstruction(id, 'one two three', { num_words: 4, relation: 'less than' })).toBe(true)
  })

  it('length_constraints:number_sentences enforces sentence count', () => {
    const id = 'length_constraints:number_sentences'
    expect(checkInstruction(id, 'One. Two.', { num_sentences: 2, relation: 'equal' })).toBe(true)
    expect(checkInstruction(id, 'One.', { num_sentences: 2, relation: 'equal' })).toBe(false)
  })

  it('detectable_content:number_placeholders counts [x] placeholders', () => {
    const id = 'detectable_content:number_placeholders'
    expect(checkInstruction(id, 'see [name] and [address]', { num_placeholders: 2, relation: 'at least' })).toBe(true)
    expect(checkInstruction(id, 'see [name]', { num_placeholders: 2, relation: 'at least' })).toBe(false)
    expect(checkInstruction(id, 'no placeholder', { num_placeholders: 1, relation: 'less than' })).toBe(true)
  })

  it('detectable_format:number_bullet_lists requires exact bullet count', () => {
    const id = 'detectable_format:number_bullet_lists'
    expect(checkInstruction(id, '* one\n* two', { num_bullets: 2 })).toBe(true)
    expect(checkInstruction(id, '- one', { num_bullets: 2 })).toBe(false)
  })

  it('detectable_format:number_highlighted_sections counts highlights', () => {
    const id = 'detectable_format:number_highlighted_sections'
    expect(checkInstruction(id, 'a *bold* and **strong**', { num_highlights: 2, relation: 'at least' })).toBe(true)
    expect(checkInstruction(id, 'a *bold*', { num_highlights: 2, relation: 'at least' })).toBe(false)
    expect(checkInstruction(id, 'no highlight', { num_highlights: 1, relation: 'less than' })).toBe(true)
  })

  it('detectable_format:number_sections counts section markers', () => {
    const id = 'detectable_format:number_sections'
    expect(
      checkInstruction(id, 'Section 1\nSection 2', {
        section_spliter: 'Section',
        num_sections: 2,
        relation: 'at least',
      }),
    ).toBe(true)
    expect(
      checkInstruction(id, 'Section 1', { section_spliter: 'Section', num_sections: 2, relation: 'at least' }),
    ).toBe(false)
    expect(
      checkInstruction(id, 'no sections here', { section_spliter: 'Section', num_sections: 1, relation: 'less than' }),
    ).toBe(true)
  })

  it('detectable_format:number_paragraphs requires exact *** count', () => {
    const id = 'detectable_format:number_paragraphs'
    expect(checkInstruction(id, 'first***second', { num_paragraphs: 2 })).toBe(true)
    expect(checkInstruction(id, 'first', { num_paragraphs: 2 })).toBe(false)
    expect(checkInstruction(id, 'first*** ***second', { num_paragraphs: 2 })).toBe(false)
  })

  it('detectable_format:postscript requires a postscript marker', () => {
    const id = 'detectable_format:postscript'
    expect(checkInstruction(id, 'body\nP.S. thanks', { postscript_marker: 'P.S.' })).toBe(true)
    expect(checkInstruction(id, 'body', { postscript_marker: 'P.S.' })).toBe(false)
    expect(checkInstruction(id, 'body\nBest regards', { postscript_marker: 'Best regards' })).toBe(true)
    expect(checkInstruction(id, 'body\nP.P.S thanks', { postscript_marker: 'P.P.S' })).toBe(true)
  })

  it('detectable_format:title requires a <<title>>', () => {
    const id = 'detectable_format:title'
    expect(checkInstruction(id, 'here is <<a title>>', {})).toBe(true)
    expect(checkInstruction(id, 'no title', {})).toBe(false)
  })

  it('startend:end_checker requires an ending phrase', () => {
    const id = 'startend:end_checker'
    expect(checkInstruction(id, 'body. Any other questions?', { end_phrase: 'Any other questions?' })).toBe(true)
    expect(checkInstruction(id, 'body.', { end_phrase: 'Any other questions?' })).toBe(false)
  })

  it('startend:quotation requires double-quote wrapping', () => {
    const id = 'startend:quotation'
    expect(checkInstruction(id, '"hello"', {})).toBe(true)
    expect(checkInstruction(id, 'hello', {})).toBe(false)
  })

  it('startend:constrained requires a starting phrase', () => {
    const id = 'startend:constrained'
    expect(checkInstruction(id, 'My answer is yes', { starter: 'My answer is' })).toBe(true)
    expect(checkInstruction(id, 'yes', { starter: 'My answer is' })).toBe(false)
  })

  it('change_case:capital_word_frequency counts all-caps words', () => {
    const id = 'change_case:capital_word_frequency'
    expect(checkInstruction(id, 'a HELLO world TEST', { frequency: 2, relation: 'at least' })).toBe(true)
    expect(checkInstruction(id, 'a HELLO world', { frequency: 2, relation: 'at least' })).toBe(false)
  })

  it('punctuation:no_comma forbids commas', () => {
    const id = 'punctuation:no_comma'
    expect(checkInstruction(id, 'no commas here', {})).toBe(true)
    expect(checkInstruction(id, 'a, b', {})).toBe(false)
  })

  it('combination:repeat_prompt requires repeating the prompt', () => {
    const id = 'combination:repeat_prompt'
    expect(checkInstruction(id, 'Write a poem about trees', { prompt_to_repeat: 'Write a poem' })).toBe(true)
    expect(checkInstruction(id, 'A poem about trees', { prompt_to_repeat: 'Write a poem' })).toBe(false)
  })

  it('combination:two_responses requires two distinct responses', () => {
    const id = 'combination:two_responses'
    expect(checkInstruction(id, 'first******second', {})).toBe(true)
    expect(checkInstruction(id, 'same******same', {})).toBe(false)
    expect(checkInstruction(id, 'first****** ******second', {})).toBe(false)
  })
})

describe('IFEval aggregation', () => {
  it('checkInstructions passes only when every instruction passes', () => {
    const instructions = [
      { id: 'keywords:existence', kwargs: { keywords: ['cat'] } },
      { id: 'punctuation:no_comma', kwargs: {} },
    ]
    expect(checkInstructions(instructions, 'the cat sat')).toBe(true)
    expect(checkInstructions(instructions, 'the dog, sat')).toBe(false)
  })

  it('checkInstructions on an empty list is vacuously true', () => {
    expect(checkInstructions([], 'anything')).toBe(true)
  })

  it('rejects unsupported instruction ids', () => {
    expect(() => checkInstruction('unknown:id', 'x', {})).toThrow(/unsupported instruction id/)
  })

  it('rejects missing or malformed kwargs', () => {
    expect(() => checkInstruction('keywords:existence', 'x', {})).toThrow(/keywords/)
    expect(() => checkInstruction('keywords:existence', 'x', { keywords: [''] })).toThrow(/keywords/)
    expect(() =>
      checkInstruction('length_constraints:number_words', 'x', { num_words: 'x', relation: 'at least' }),
    ).toThrow(/num_words/)
    expect(() => checkInstruction('length_constraints:number_words', 'x', { num_words: 1, relation: 'weird' })).toThrow(
      /relation/,
    )
  })

  it('handles empty responses and token-less text', () => {
    expect(checkInstruction('length_constraints:number_words', '', { num_words: 1, relation: 'less than' })).toBe(true)
    expect(checkInstruction('change_case:capital_word_frequency', '!!!', { frequency: 1, relation: 'less than' })).toBe(
      true,
    )
  })
})

describe('InstructionFollowingScorer', () => {
  it('scores a fully-compliant response', () => {
    const scorer = new InstructionFollowingScorer()
    const sample = {
      id: 's1',
      input: 'p',
      reference: null,
      metadata: {
        instruction_id_list: ['keywords:existence', 'punctuation:no_comma'],
        kwargs: [{ keywords: ['cat'] }, {}],
      },
    }
    expect(scorer.score(sample, 'the cat sat').correct).toBe(true)
    expect(scorer.score(sample, 'the dog, sat').correct).toBe(false)
  })

  it('throws when metadata is missing', () => {
    const scorer = new InstructionFollowingScorer()
    expect(() => scorer.score({ id: 's1', input: 'p', reference: null }, 'x')).toThrow(/missing instruction_id_list/)
  })

  it('falls back to empty kwargs when an entry is absent', () => {
    const scorer = new InstructionFollowingScorer()
    const sample = {
      id: 's1',
      input: 'p',
      reference: null,
      metadata: {
        instruction_id_list: ['punctuation:no_comma'],
        kwargs: [undefined],
      },
    }
    expect(scorer.score(sample, 'no comma').correct).toBe(true)
    expect(scorer.score(sample, 'a, b').correct).toBe(false)
  })

  it('exposes the supported instruction ids', () => {
    expect(Object.keys(instructionCheckers).length).toBeGreaterThanOrEqual(20)
  })
})
