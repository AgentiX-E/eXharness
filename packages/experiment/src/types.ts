import type { Config } from '@exharness/evolution'

/**
 * A next evaluation requested by an optimizer. `budget` is the resource
 * assigned to this configuration (for BOHB it is the successive-halving budget;
 * for random search it is a fixed full budget).
 */
export interface OptimizerSuggestion {
  config: Config
  budget: number
}

/** The observed outcome of evaluating a configuration on a budget. */
export interface OptimizerObservation {
  config: Config
  /** Objective value; lower is better. */
  loss: number
  budget: number
}

/** The best configuration an optimizer has observed so far. */
export interface OptimizerResult {
  config: Config
  loss: number
  budget: number
}

/**
 * The synchronous suggest/observe contract shared by every candidate selector.
 * Both `BohbOptimizer` (Bayesian + Hyperband) and `RandomSearchOptimizer`
 * (uniform baseline) satisfy it, so experiments can swap strategies freely.
 */
export interface Optimizer {
  /** Next (config, budget) to evaluate, or null when the search is complete. */
  suggest(): OptimizerSuggestion | null
  /** Record the loss of a configuration evaluated with a budget. */
  observe(result: OptimizerObservation): void
  /** Best (lowest-loss) configuration observed so far, or null. */
  best(): OptimizerResult | null
}

/** A black-box objective: configuration + budget → loss (lower is better). */
export interface Objective {
  evaluate(config: Config, budget: number): Promise<number>
}

/** The outcome of a single optimizer run. */
export interface ExperimentResult {
  optimizer: string
  bestLoss: number
  bestConfig: Config
  evaluations: number
  traceId: string
}

/** The outcome of comparing two optimizers across repeated trials. */
export interface ComparisonResult {
  methodA: string
  methodB: string
  /** Per-trial best losses of method A (e.g. BOHB). */
  aLosses: number[]
  /** Per-trial best losses of method B (e.g. RandomSearch). */
  bLosses: number[]
  meanA: number
  meanB: number
  /** meanA - meanB. */
  meanDifference: number
  /** Welch's t-test two-tailed p-value. */
  pValue: number
  /** Cohen's d effect size. */
  cohensD: number
  /** Whether the mean difference is statistically significant at `alpha`. */
  significant: boolean
  trials: number
}
