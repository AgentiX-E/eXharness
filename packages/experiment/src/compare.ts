import { cohensD, welchTTest } from '@exharness/eval'
import { BohbOptimizer, type Param } from '@exharness/evolution'
import { runExperiment } from './experiment.js'
import { RandomSearchOptimizer } from './random-search.js'
import type { ComparisonResult, Objective, Optimizer } from './types.js'

/** A named optimizer factory; the seed is varied per trial for independence. */
export interface OptimizerFactory {
  name: string
  create: (seed: number) => Optimizer
}

export interface CompareOptimizersOptions {
  objective: Objective
  methodA: OptimizerFactory
  methodB: OptimizerFactory
  /** Number of independent trials per optimizer (defaults to 5). */
  trials?: number
  /** Significance threshold (defaults to 0.05). */
  alpha?: number
  seed?: number
}

/**
 * Compare two optimizers across repeated independent trials, then report
 * Welch's t-test and Cohen's d so the result is backed by statistical
 * significance rather than a single lucky run. Optimizers are injected as
 * factories so the statistical machinery can be tested deterministically.
 */
export async function compareOptimizers(options: CompareOptimizersOptions): Promise<ComparisonResult> {
  const trials = options.trials ?? 5
  if (!Number.isInteger(trials) || trials < 2) {
    throw new Error('compareOptimizers: trials must be an integer >= 2')
  }
  const alpha = options.alpha ?? 0.05
  if (!(alpha > 0 && alpha < 1)) throw new Error('compareOptimizers: alpha must be in (0, 1)')

  const aLosses: number[] = []
  const bLosses: number[] = []
  const seed = options.seed ?? 0xb0bb

  for (let i = 0; i < trials; i++) {
    const a = options.methodA.create(seed + i)
    const aResult = await runExperiment({
      optimizer: a,
      objective: options.objective,
      optimizerName: options.methodA.name,
    })
    aLosses.push(aResult.bestLoss)

    const b = options.methodB.create(seed + i)
    const bResult = await runExperiment({
      optimizer: b,
      objective: options.objective,
      optimizerName: options.methodB.name,
    })
    bLosses.push(bResult.bestLoss)
  }

  const t = welchTTest(aLosses, bLosses)
  const d = cohensD(aLosses, bLosses)
  const meanA = aLosses.reduce((sum, v) => sum + v, 0) / aLosses.length
  const meanB = bLosses.reduce((sum, v) => sum + v, 0) / bLosses.length

  return {
    methodA: options.methodA.name,
    methodB: options.methodB.name,
    aLosses,
    bLosses,
    meanA,
    meanB,
    meanDifference: t.meanDifference,
    pValue: t.pValue,
    cohensD: d,
    significant: t.pValue < alpha,
    trials,
  }
}

/** A BOHB (Bayesian + Hyperband) optimizer factory. */
export function bohbOptimizerFactory(
  params: Param[],
  minBudget: number,
  maxBudget: number,
  eta?: number,
): OptimizerFactory {
  return {
    name: 'BOHB',
    create: (seed) => new BohbOptimizer({ params, minBudget, maxBudget, eta, seed }),
  }
}

/** A uniform random-search optimizer factory (the standard baseline). */
export function randomSearchOptimizerFactory(
  params: Param[],
  options?: { budget?: number; evaluations?: number },
): OptimizerFactory {
  return {
    name: 'RandomSearch',
    create: (seed) =>
      new RandomSearchOptimizer({
        params,
        budget: options?.budget,
        evaluations: options?.evaluations,
        seed,
      }),
  }
}
