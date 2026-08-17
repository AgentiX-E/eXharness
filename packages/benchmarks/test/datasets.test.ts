import { describe, expect, it } from 'vitest'
import { gsm8kBenchmark, ifevalBenchmark, multipleChoiceBenchmark, parseJsonl } from '../src/index.js'

describe('parseJsonl', () => {
  it('parses valid lines and skips blanks', () => {
    const parsed = parseJsonl('{"a":1}\n\n{"a":2}\n')
    expect(parsed).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('throws with a line number on invalid JSON', () => {
    expect(() => parseJsonl('{"a":1}\nnot-json')).toThrow(/line 2/)
  })
})

describe('multipleChoiceBenchmark', () => {
  it('builds samples with choices metadata and a multiple-choice scorer', () => {
    const benchmark = multipleChoiceBenchmark('m', [
      { question: 'q1', choices: ['a', 'b'], answer: 'A' },
      { question: 'q2', choices: ['c', 'd'], answer: 'B' },
    ])
    const samples = benchmark.dataset.load()
    expect(samples).toHaveLength(2)
    expect(samples[0]!.metadata).toEqual({ choices: ['a', 'b'] })
    expect(benchmark.scorer.score(samples[0]!, 'A').correct).toBe(true)
    expect(benchmark.scorer.score(samples[1]!, 'A').correct).toBe(false)
  })

  it('supports a custom letter set', () => {
    const benchmark = multipleChoiceBenchmark('m', [{ question: 'q', choices: ['x', 'y'], answer: 'X' }], ['X', 'Y'])
    const samples = benchmark.dataset.load()
    expect(benchmark.scorer.score(samples[0]!, 'X').correct).toBe(true)
    expect(benchmark.scorer.score(samples[0]!, 'A').correct).toBe(false)
  })
})

describe('ifevalBenchmark', () => {
  it('builds samples with instruction metadata', () => {
    const benchmark = ifevalBenchmark('i', [
      { prompt: 'p1', instruction_id_list: ['punctuation:no_comma'], kwargs: [{}] },
    ])
    const samples = benchmark.dataset.load()
    expect(samples[0]!.metadata).toEqual({ instruction_id_list: ['punctuation:no_comma'], kwargs: [{}] })
    expect(benchmark.scorer.score(samples[0]!, 'no commas').correct).toBe(true)
    expect(benchmark.scorer.score(samples[0]!, 'a, b').correct).toBe(false)
  })
})

describe('gsm8kBenchmark', () => {
  it('builds numeric-answer samples', () => {
    const benchmark = gsm8kBenchmark('g', [{ question: '1+1?', answer: '2' }])
    const samples = benchmark.dataset.load()
    expect(samples[0]!.reference).toBe('2')
    expect(benchmark.scorer.score(samples[0]!, 'The answer is 2').correct).toBe(true)
    expect(benchmark.scorer.score(samples[0]!, '3').correct).toBe(false)
  })
})
