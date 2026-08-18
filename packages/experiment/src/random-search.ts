import { mulberry32, randomConfig, type Param, type Rng } from '@exharness/evolution'
import type { Optimizer, OptimizerObservation, OptimizerResult, OptimizerSuggestion } from './types.js'

export interface RandomSearchOptions {
  params: Param[]
  /** Fixed budget assigned to every configuration (defaults to 1). */
  budget?: number
  /** Total number of evaluations before the search terminates (defaults to 20). */
  evaluations?: number
  seed?: number
}

/**
 * Uniform random search: sample configurations from the parameter space and
 * evaluate each on a fixed budget. It is the standard baseline against which
 * Bayesian/Hyperband optimizers are compared.
 */
export class RandomSearchOptimizer implements Optimizer {
  private readonly params: Param[]
  private readonly rng: Rng
  private readonly budget: number
  private readonly evaluations: number
  private cursor = 0
  private bestResult: OptimizerResult | null = null

  constructor(options: RandomSearchOptions) {
    if (options.params.length === 0) throw new Error('RandomSearchOptimizer: at least one parameter is required')
    const budget = options.budget ?? 1
    if (!(budget > 0) || !Number.isFinite(budget)) {
      throw new Error('RandomSearchOptimizer: budget must be a positive finite number')
    }
    const evaluations = options.evaluations ?? 20
    if (!Number.isInteger(evaluations) || evaluations < 1) {
      throw new Error('RandomSearchOptimizer: evaluations must be a positive integer')
    }
    this.params = [...options.params]
    this.rng = mulberry32(options.seed ?? 0x5eed)
    this.budget = budget
    this.evaluations = evaluations
  }

  suggest(): OptimizerSuggestion | null {
    if (this.cursor >= this.evaluations) return null
    this.cursor++
    return { config: randomConfig(this.params, this.rng), budget: this.budget }
  }

  observe(result: OptimizerObservation): void {
    if (!Number.isFinite(result.loss)) throw new Error('RandomSearchOptimizer: loss must be finite')
    if (this.bestResult === null || result.loss < this.bestResult.loss) {
      this.bestResult = { config: { ...result.config }, loss: result.loss, budget: result.budget }
    }
  }

  best(): OptimizerResult | null {
    return this.bestResult
  }
}
