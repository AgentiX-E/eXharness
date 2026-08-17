import { bootstrapMeanCI, mean } from '@exharness/eval'
import type { Benchmark, BenchmarkResult, Generate, ScoreResult } from './types.js'

/**
 * Aggregate per-sample scores into a benchmark result with a 95% percentile
 * bootstrap confidence interval around the mean score.
 */
export function aggregate(name: string, perSample: readonly ScoreResult[], seed = 0xb00c): BenchmarkResult {
  const samples = perSample.length
  const correct = perSample.filter((s) => s.correct).length
  const scores = perSample.map((s) => s.score)
  const accuracy = samples === 0 ? 0 : correct / samples
  const meanScore = samples === 0 ? 0 : mean(scores)
  const confidenceInterval =
    samples === 0
      ? { estimate: 0, lower: 0, upper: 0, confidence: 0.95 }
      : bootstrapMeanCI(scores, { iterations: 2000, confidence: 0.95, seed })
  return { name, samples, correct, accuracy, meanScore, confidenceInterval, perSample: [...perSample] }
}

export interface RunnerOptions {
  /** Seed for the confidence-interval bootstrap. */
  seed?: number
}

/** Runs a benchmark by generating an output for each sample and scoring it. */
export class BenchmarkRunner {
  private readonly seed: number

  constructor(options: RunnerOptions = {}) {
    this.seed = options.seed ?? 0xb00c
  }

  async run(benchmark: Benchmark, generate: Generate): Promise<BenchmarkResult> {
    const samples = await benchmark.dataset.load()
    const perSample: ScoreResult[] = []
    for (const sample of samples) {
      const output = await generate(sample.input)
      perSample.push(benchmark.scorer.score(sample, output))
    }
    return aggregate(benchmark.name, perSample, this.seed)
  }
}
