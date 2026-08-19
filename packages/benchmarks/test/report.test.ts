import { describe, expect, it } from 'vitest'
import { gsm8kBenchmark } from '../src/datasets.js'
import {
  assembleCompetitiveReport,
  humanEvalToBenchmarkResult,
  runBenchmarkSuite,
  type SelfEvolutionComparison,
} from '../src/report.js'

const fixedNow = () => new Date('2026-08-19T00:00:00.000Z')

const comparison: SelfEvolutionComparison = {
  methodA: 'BOHB',
  methodB: 'RandomSearch',
  meanA: 0.01,
  meanB: 0.2,
  meanDifference: -0.19,
  pValue: 0.001,
  cohensD: -2.5,
  significant: true,
  trials: 5,
}

describe('runBenchmarkSuite', () => {
  it('aggregates multiple benchmarks into a single report', async () => {
    const a = gsm8kBenchmark('a', [
      { question: '1+1', answer: '2' },
      { question: '2+2', answer: '4' },
    ])
    const b = gsm8kBenchmark('b', [
      { question: '3+3', answer: '6' },
      { question: '4+4', answer: '8' },
      { question: '5+5', answer: '10' },
    ])
    const report = await runBenchmarkSuite(
      [a, b],
      async (input) => {
        if (input === '1+1') return '2'
        if (input === '2+2') return 'wrong'
        if (input === '3+3') return '6'
        if (input === '4+4') return '8'
        return '10'
      },
      { now: fixedNow },
    )

    expect(report.generatedAt).toBe('2026-08-19T00:00:00.000Z')
    expect(report.benchmarks).toHaveLength(2)
    expect(report.benchmarks[0]!.name).toBe('a')
    expect(report.benchmarks[0]!.correct).toBe(1)
    expect(report.benchmarks[1]!.correct).toBe(3)
    expect(report.totalSamples).toBe(5)
    expect(report.totalCorrect).toBe(4)
    expect(report.meanAccuracy).toBeCloseTo(0.8)
  })

  it('returns zero accuracy for an empty benchmark set', async () => {
    const report = await runBenchmarkSuite([], async () => '', { now: fixedNow })
    expect(report.benchmarks).toEqual([])
    expect(report.totalSamples).toBe(0)
    expect(report.totalCorrect).toBe(0)
    expect(report.meanAccuracy).toBe(0)
  })

  it('uses the real clock when now is not injected', async () => {
    const benchmark = gsm8kBenchmark('a', [{ question: '1+1', answer: '2' }])
    const report = await runBenchmarkSuite([benchmark], async () => '2')
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false)
  })
})

describe('assembleCompetitiveReport', () => {
  it('combines the suite and the self-evolution comparison', () => {
    const suite = {
      generatedAt: '2026-08-19T00:00:00.000Z',
      benchmarks: [],
      totalSamples: 0,
      totalCorrect: 0,
      meanAccuracy: 0,
    }
    const report = assembleCompetitiveReport({ model: 'deepseek-chat', suite, selfEvolution: comparison })
    expect(report.model).toBe('deepseek-chat')
    expect(report.generatedAt).toBe('2026-08-19T00:00:00.000Z')
    expect(report.benchmarks).toEqual([])
    expect(report.selfEvolution).toEqual(comparison)
  })
})

describe('humanEvalToBenchmarkResult', () => {
  it('maps pass@1 (numSamples=1) to a uniform BenchmarkResult', () => {
    const result = humanEvalToBenchmarkResult({
      samples: [
        { taskId: 'HumanEval/0', passed: 1, total: 1 },
        { taskId: 'HumanEval/1', passed: 0, total: 1 },
      ],
      totalN: 2,
      totalC: 1,
      passAt1: 0.5,
      passAtK: 0.5,
      k: 1,
    })
    expect(result.name).toBe('humaneval')
    expect(result.samples).toBe(2)
    expect(result.correct).toBe(1)
    expect(result.accuracy).toBeCloseTo(0.5)
    expect(result.perSample).toHaveLength(2)
    expect(result.confidenceInterval.estimate).toBeCloseTo(0.5)
  })

  it('returns zero for an empty result', () => {
    const result = humanEvalToBenchmarkResult({
      samples: [],
      totalN: 0,
      totalC: 0,
      passAt1: 0,
      passAtK: 0,
      k: 1,
    })
    expect(result.samples).toBe(0)
    expect(result.accuracy).toBe(0)
    expect(result.confidenceInterval.estimate).toBe(0)
  })

  it('scores a zero-total sample entry as zero', () => {
    const result = humanEvalToBenchmarkResult({
      samples: [{ taskId: 'HumanEval/0', passed: 0, total: 0 }],
      totalN: 0,
      totalC: 0,
      passAt1: 0,
      passAtK: 0,
      k: 1,
    })
    expect(result.perSample[0]!.score).toBe(0)
    expect(result.perSample[0]!.correct).toBe(true)
  })
})
