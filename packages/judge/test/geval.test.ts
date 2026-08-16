import { describe, expect, it } from 'vitest'
import { MockProvider } from '@exharness/llm'
import { GEvalJudge, buildGEvalPrompt, parseGEvalResponse } from '../src/index.js'

const criteria = [
  { name: 'accuracy', description: 'Is the answer factually correct?' },
  { name: 'conciseness', description: 'Is the answer brief and to the point?' },
]

describe('buildGEvalPrompt', () => {
  it('includes criteria, scale, input, output and the JSON contract', () => {
    const prompt = buildGEvalPrompt(criteria, 5, 'What is 2+2?', '4', false)
    expect(prompt).toContain('accuracy')
    expect(prompt).toContain('conciseness')
    expect(prompt).toContain('1 to 5')
    expect(prompt).toContain('[Input]: What is 2+2?')
    expect(prompt).toContain('[Output]: 4')
    expect(prompt).toContain('"score"')
  })

  it('appends the chain-of-thought instruction only when requested', () => {
    const plain = buildGEvalPrompt(criteria, 5, 'i', 'o', false)
    const cot = buildGEvalPrompt(criteria, 5, 'i', 'o', true)
    expect(plain).not.toContain('step by step')
    expect(cot).toContain('Reason step by step')
  })
})

describe('parseGEvalResponse', () => {
  it('parses a valid response', () => {
    const parsed = parseGEvalResponse(
      '{"score": 4, "criteria": {"accuracy": 4, "conciseness": 5}, "rationale": "good"}',
      criteria,
      5,
    )
    expect(parsed.score).toBe(4)
    expect(parsed.criteriaScores).toEqual({ accuracy: 4, conciseness: 5 })
    expect(parsed.rationale).toBe('good')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseGEvalResponse('not json', criteria, 5)).toThrow(/not valid JSON/)
  })

  it('throws on a schema-invalid response', () => {
    expect(() => parseGEvalResponse('{"score": "four"}', criteria, 5)).toThrow(/schema invalid/)
  })

  it('throws when the overall score is out of range', () => {
    expect(() =>
      parseGEvalResponse('{"score": 9, "criteria": {"accuracy": 4, "conciseness": 5}, "rationale": "x"}', criteria, 5),
    ).toThrow(/out of range/)
  })

  it('throws when a criterion is missing', () => {
    expect(() => parseGEvalResponse('{"score": 4, "criteria": {"accuracy": 4}, "rationale": "x"}', criteria, 5)).toThrow(
      /missing criterion "conciseness"/,
    )
  })

  it('throws when a criterion score is out of range', () => {
    expect(() =>
      parseGEvalResponse('{"score": 4, "criteria": {"accuracy": 4, "conciseness": 99}, "rationale": "x"}', criteria, 5),
    ).toThrow(/out of range/)
  })
})

describe('GEvalJudge', () => {
  it('rejects an empty criteria list and scale < 2', () => {
    const llm = new MockProvider()
    expect(() => new GEvalJudge(llm, { criteria: [] })).toThrow(/at least one criterion/)
    expect(() => new GEvalJudge(llm, { criteria, scale: 1 })).toThrow(/>= 2/)
  })

  it('scores an output and normalizes to [0, 1]', async () => {
    const llm = new MockProvider({
      responses: ['{"score": 5, "criteria": {"accuracy": 5, "conciseness": 5}, "rationale": "perfect"}'],
    })
    const judge = new GEvalJudge(llm, { criteria })
    const result = await judge.evaluate('q', 'answer')
    expect(result.score).toBe(5)
    expect(result.normalizedScore).toBeCloseTo(1, 10)
    expect(result.rationale).toBe('perfect')
    expect(result.criteriaScores).toEqual({ accuracy: 5, conciseness: 5 })
  })

  it('normalizes a mid-range score on a custom scale', async () => {
    const llm = new MockProvider({
      responses: ['{"score": 5, "criteria": {"accuracy": 5, "conciseness": 5}, "rationale": "ok"}'],
    })
    const judge = new GEvalJudge(llm, { criteria, scale: 10 })
    const result = await judge.evaluate('q', 'a')
    expect(result.normalizedScore).toBeCloseTo((5 - 1) / 9, 10)
  })
})
