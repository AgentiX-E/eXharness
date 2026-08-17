import { describe, expect, it } from 'vitest'
import { BenchmarkRunner, aggregate, gsm8kBenchmark } from '../src/index.js'
import type { ScoreResult } from '../src/index.js'

describe('aggregate', () => {
  it('computes accuracy and a confidence interval', () => {
    const perSample: ScoreResult[] = [
      { sampleId: 'a', correct: true, score: 1 },
      { sampleId: 'b', correct: false, score: 0 },
      { sampleId: 'c', correct: true, score: 1 },
      { sampleId: 'd', correct: true, score: 1 },
    ]
    const result = aggregate('test', perSample)
    expect(result.samples).toBe(4)
    expect(result.correct).toBe(3)
    expect(result.accuracy).toBeCloseTo(0.75)
    expect(result.meanScore).toBeCloseTo(0.75)
    expect(result.confidenceInterval.estimate).toBeCloseTo(0.75)
    expect(result.confidenceInterval.lower).toBeLessThanOrEqual(0.75)
    expect(result.confidenceInterval.upper).toBeGreaterThanOrEqual(0.75)
    expect(result.perSample).toEqual(perSample)
  })

  it('handles an empty sample set', () => {
    const result = aggregate('empty', [])
    expect(result.samples).toBe(0)
    expect(result.accuracy).toBe(0)
    expect(result.meanScore).toBe(0)
  })
})

describe('BenchmarkRunner', () => {
  it('runs a benchmark end-to-end with a synchronous generator', async () => {
    const benchmark = gsm8kBenchmark('g', [
      { question: '1+1?', answer: '2' },
      { question: '2+2?', answer: '4' },
    ])
    const runner = new BenchmarkRunner({ seed: 1 })
    const result = await runner.run(benchmark, (input) => (input === '1+1?' ? '2' : '5'))
    expect(result.samples).toBe(2)
    expect(result.accuracy).toBeCloseTo(0.5)
  })

  it('supports asynchronous generators', async () => {
    const benchmark = gsm8kBenchmark('g', [{ question: '1+1?', answer: '2' }])
    const runner = new BenchmarkRunner()
    const result = await runner.run(benchmark, async () => '2')
    expect(result.accuracy).toBe(1)
  })
})
