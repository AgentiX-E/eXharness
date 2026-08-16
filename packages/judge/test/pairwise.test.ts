import { describe, expect, it } from 'vitest'
import { MockProvider } from '@exharness/llm'
import { PairwiseJudge, buildPairwisePrompt, parsePairwiseResponse } from '../src/index.js'

describe('buildPairwisePrompt', () => {
  it('presents the question and both answers in fixed positions', () => {
    const prompt = buildPairwisePrompt('q', 'answer-a', 'answer-b')
    expect(prompt).toContain('[Question]: q')
    expect(prompt).toContain('[Answer A]: answer-a')
    expect(prompt).toContain('[Answer B]: answer-b')
    expect(prompt).toContain('"A", "B", or "tie"')
  })
})

describe('parsePairwiseResponse', () => {
  it('parses single-token verdicts', () => {
    expect(parsePairwiseResponse('A')).toBe('A')
    expect(parsePairwiseResponse('b')).toBe('B')
    expect(parsePairwiseResponse('tie')).toBe('tie')
  })

  it('parses free-form verdicts mentioning an answer', () => {
    expect(parsePairwiseResponse('Answer A is better')).toBe('A')
    expect(parsePairwiseResponse('I prefer answer b')).toBe('B')
  })

  it('defaults to tie for ambiguous or empty verdicts', () => {
    expect(parsePairwiseResponse('both are good')).toBe('tie')
    expect(parsePairwiseResponse('')).toBe('tie')
  })
})

describe('PairwiseJudge', () => {
  it('returns A when both orderings agree on A', async () => {
    const llm = new MockProvider({ responses: ['A', 'B'] })
    const judge = new PairwiseJudge(llm)
    const result = await judge.compare('q', 'good', 'bad')
    expect(result.winner).toBe('A')
    expect(result.confidence).toBe(1)
    expect(result.positionBiasDetected).toBe(false)
  })

  it('returns B when both orderings agree on B', async () => {
    const llm = new MockProvider({ responses: ['B', 'A'] })
    const judge = new PairwiseJudge(llm)
    const result = await judge.compare('q', 'bad', 'good')
    expect(result.winner).toBe('B')
    expect(result.positionBiasDetected).toBe(false)
  })

  it('returns tie when both orderings agree on a tie', async () => {
    const llm = new MockProvider({ responses: ['tie', 'tie'] })
    const judge = new PairwiseJudge(llm)
    const result = await judge.compare('q', 'a', 'b')
    expect(result.winner).toBe('tie')
    expect(result.confidence).toBe(1)
    expect(result.positionBiasDetected).toBe(false)
  })

  it('detects position bias when each ordering favors the first position', async () => {
    const llm = new MockProvider({ responses: ['A', 'A'] })
    const judge = new PairwiseJudge(llm)
    const result = await judge.compare('q', 'a', 'b')
    expect(result.winner).toBe('tie')
    expect(result.confidence).toBe(0)
    expect(result.positionBiasDetected).toBe(true)
  })
})
