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
    expect(result.failedSamples).toBe(0)
  })

  it('counts generation failures as failedSamples', () => {
    const perSample: ScoreResult[] = [
      { sampleId: 'a', correct: true, score: 1 },
      { sampleId: 'b', correct: false, score: 0, error: 'boom' },
      { sampleId: 'c', correct: false, score: 0 },
    ]
    const result = aggregate('test', perSample)
    expect(result.failedSamples).toBe(1)
    expect(result.correct).toBe(1)
    expect(result.samples).toBe(3)
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

  it('records a generation failure per sample and continues', async () => {
    const benchmark = gsm8kBenchmark('g', [
      { question: '1+1?', answer: '2' },
      { question: '2+2?', answer: '4' },
      { question: '3+3?', answer: '6' },
    ])
    const runner = new BenchmarkRunner({ seed: 1 })
    const result = await runner.run(benchmark, async (input) => {
      if (input === '2+2?') throw new Error('boom')
      return input === '1+1?' ? '2' : '6'
    })
    expect(result.samples).toBe(3)
    expect(result.correct).toBe(2)
    expect(result.accuracy).toBeCloseTo(2 / 3)
    expect(result.failedSamples).toBe(1)
    expect(result.perSample[1]).toMatchObject({ sampleId: 'g-1', correct: false, score: 0, error: 'boom' })
  })

  it('stringifies non-Error generation failures', async () => {
    const benchmark = gsm8kBenchmark('g', [{ question: '1+1?', answer: '2' }])
    const runner = new BenchmarkRunner()
    const result = await runner.run(benchmark, async () => {
      throw 'oops'
    })
    expect(result.failedSamples).toBe(1)
    expect(result.perSample[0]!.error).toBe('oops')
  })
})
