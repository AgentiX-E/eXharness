import { bootstrapMeanCI } from '@exharness/eval'
import type { Benchmark, BenchmarkResult, Generate, ScoreResult } from './types.js'
import type { HumanEvalResult } from './human-eval.js'
import { BenchmarkRunner } from './runner.js'

/** The aggregate of running several benchmarks over the same generator. */
export interface SuiteReport {
  generatedAt: string
  benchmarks: BenchmarkResult[]
  totalSamples: number
  totalCorrect: number
  /** Overall accuracy across all samples (equal to totalCorrect/totalSamples). */
  meanAccuracy: number
}

export interface RunBenchmarkSuiteOptions {
  /** Seed for the per-benchmark bootstrap confidence intervals. */
  seed?: number
  /** Clock for the report timestamp (injectable for deterministic tests). */
  now?: () => Date
}

/**
 * Run every benchmark against the same generator and aggregate the results
 * into a single report with an overall accuracy figure.
 */
export async function runBenchmarkSuite(
  benchmarks: readonly Benchmark[],
  generate: Generate,
  options: RunBenchmarkSuiteOptions = {},
): Promise<SuiteReport> {
  const runner = new BenchmarkRunner({ seed: options.seed })
  const results: BenchmarkResult[] = []
  for (const benchmark of benchmarks) {
    results.push(await runner.run(benchmark, generate))
  }
  const totalSamples = results.reduce((sum, r) => sum + r.samples, 0)
  const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0)
  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    benchmarks: results,
    totalSamples,
    totalCorrect,
    meanAccuracy: totalSamples === 0 ? 0 : totalCorrect / totalSamples,
  }
}

/**
 * The statistical summary of a self-evolution optimizer comparison. It is a
 * structural subset of `ComparisonResult` so callers can pass the experiment
 * result directly without importing `@exharness/experiment` here (preserving
 * the benchmark -> experiment layering).
 */
export interface SelfEvolutionComparison {
  methodA: string
  methodB: string
  meanA: number
  meanB: number
  meanDifference: number
  pValue: number
  cohensD: number
  significant: boolean
  trials: number
}

/** The complete competitive-benchmark report written by the benchmark workflow. */
export interface CompetitiveBenchmarkReport {
  generatedAt: string
  model: string
  benchmarks: BenchmarkResult[]
  selfEvolution: SelfEvolutionComparison
}

export interface AssembleCompetitiveReportInput {
  model: string
  suite: SuiteReport
  selfEvolution: SelfEvolutionComparison
}

/**
 * Combine benchmark scores and the self-evolution significance test into the
 * single report artifact emitted by the competitive benchmark workflow.
 */
export function assembleCompetitiveReport(input: AssembleCompetitiveReportInput): CompetitiveBenchmarkReport {
  return {
    generatedAt: input.suite.generatedAt,
    model: input.model,
    benchmarks: input.suite.benchmarks,
    selfEvolution: input.selfEvolution,
  }
}

/**
 * Convert a HumanEval `pass@k` result into the uniform `BenchmarkResult` shape
 * so it can sit alongside the generic benchmarks in a single report. With the
 * default `numSamples = 1` (one completion per task), `pass@1` equals the raw
 * completion accuracy `totalC / totalN`, so the mapping is exact.
 */
export function humanEvalToBenchmarkResult(result: HumanEvalResult, seed = 0xb00c): BenchmarkResult {
  const perSample: ScoreResult[] = result.samples.map((sample) => ({
    sampleId: sample.taskId,
    correct: sample.passed === sample.total,
    score: sample.total === 0 ? 0 : sample.passed / sample.total,
  }))
  const samples = result.totalN
  const correct = result.totalC
  const accuracy = samples === 0 ? 0 : correct / samples
  const scores = perSample.map((s) => s.score)
  const confidenceInterval =
    samples === 0
      ? { estimate: 0, lower: 0, upper: 0, confidence: 0.95 }
      : bootstrapMeanCI(scores, { iterations: 2000, confidence: 0.95, seed })
  return {
    name: 'humaneval',
    samples,
    correct,
    accuracy,
    meanScore: accuracy,
    confidenceInterval,
    perSample,
  }
}
