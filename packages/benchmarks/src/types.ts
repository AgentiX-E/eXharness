import type { ConfidenceInterval } from '@exharness/eval'

/**
 * A single benchmark test case. The `input` is what the model sees; `reference`
 * is the expected answer (its shape is benchmark-specific); `metadata` carries
 * benchmark-specific fields (e.g. MMLU choices, IFEval instruction id list).
 */
export interface BenchmarkSample {
  id: string
  input: string
  reference: unknown
  metadata?: Record<string, unknown>
}

/** The per-sample scoring outcome. `score` is in [0, 1] (partial credit allowed). */
export interface ScoreResult {
  sampleId: string
  correct: boolean
  score: number
  details?: Record<string, unknown>
}

/** Maps a model output for a sample to a score. */
export interface Scorer {
  score(sample: BenchmarkSample, output: string): ScoreResult
}

/** A named collection of samples. */
export interface Dataset {
  name: string
  load(): BenchmarkSample[] | Promise<BenchmarkSample[]>
}

/** A benchmark couples a dataset with its scorer. */
export interface Benchmark {
  name: string
  dataset: Dataset
  scorer: Scorer
}

/** Aggregated benchmark result with scientific statistics. */
export interface BenchmarkResult {
  name: string
  samples: number
  correct: number
  /** Fraction of exactly-correct samples. */
  accuracy: number
  /** Mean per-sample score (equals accuracy when scores are 0/1). */
  meanScore: number
  /** 95% confidence interval around the accuracy (percentile bootstrap). */
  confidenceInterval: ConfidenceInterval
  perSample: ScoreResult[]
}

/** Generates a model output for a benchmark input. */
export type Generate = (input: string) => string | Promise<string>
