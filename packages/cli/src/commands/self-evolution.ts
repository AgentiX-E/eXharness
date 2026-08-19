import type { Param } from '@exharness/evolution'
import {
  bohbOptimizerFactory,
  compareOptimizers,
  randomSearchOptimizerFactory,
  type ComparisonResult,
  type Objective,
} from '@exharness/experiment'

/**
 * A small deterministic analytic objective used to demonstrate the
 * self-evolution significance test without needing a live LLM. BOHB is expected
 * to find the low-loss region faster than uniform random search.
 */
const ANALYTIC_PARAMS: Param[] = [
  { type: 'float', name: 'x', min: -1, max: 1 },
  { type: 'float', name: 'y', min: -1, max: 1 },
  { type: 'categorical', name: 'mode', choices: ['good', 'bad'] },
]

const ANALYTIC_OBJECTIVE: Objective = {
  async evaluate(config) {
    const dx = (config.x as number) - 0.3
    const dy = (config.y as number) + 0.2
    return dx * dx + dy * dy + (config.mode === 'good' ? 0 : 0.8)
  },
}

/**
 * Run the BOHB-vs-random-search comparison across repeated independent trials,
 * returning the Welch t-test and Cohen's d significance statistics.
 */
export function runSelfEvolutionComparison(trials: number): Promise<ComparisonResult> {
  return compareOptimizers({
    objective: ANALYTIC_OBJECTIVE,
    methodA: bohbOptimizerFactory(ANALYTIC_PARAMS, 1, 9, 3),
    methodB: randomSearchOptimizerFactory(ANALYTIC_PARAMS, { budget: 9, evaluations: 10 }),
    trials,
  })
}
