import { bootstrapMeanCI, mean } from '@exharness/eval'
import type { Benchmark, BenchmarkResult, Generate, ScoreResult } from './types.js'

/**
 * Aggregate per-sample scores into a benchmark result with a 95% percentile
 * bootstrap confidence interval around the mean score.
 */
export function aggregate(name: string, perSample: readonly ScoreResult[], seed = 0xb00c): BenchmarkResult {
  const samples = perSample.length
  const correct = perSample.filter((s) => s.correct).length
  const failedSamples = perSample.filter((s) => s.error !== undefined).length
  const scores = perSample.map((s) => s.score)
  const accuracy = samples === 0 ? 0 : correct / samples
  const meanScore = samples === 0 ? 0 : mean(scores)
  const confidenceInterval =
    samples === 0
      ? { estimate: 0, lower: 0, upper: 0, confidence: 0.95 }
      : bootstrapMeanCI(scores, { iterations: 2000, confidence: 0.95, seed })
  return { name, samples, correct, accuracy, meanScore, confidenceInterval, perSample: [...perSample], failedSamples }
}

/** Normalise a thrown value to a human-readable message. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
      let output: string
      try {
        output = await generate(sample.input)
      } catch (error) {
        perSample.push({ sampleId: sample.id, correct: false, score: 0, error: toErrorMessage(error) })
        continue
      }
      try {
        perSample.push(benchmark.scorer.score(sample, output))
      } catch (error) {
        perSample.push({ sampleId: sample.id, correct: false, score: 0, error: toErrorMessage(error) })
      }
    }
    return aggregate(benchmark.name, perSample, this.seed)
  }
}
