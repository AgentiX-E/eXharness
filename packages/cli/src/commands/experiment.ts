import type { Param } from '@exharness/evolution'
import {
  bohbOptimizerFactory,
  compareOptimizers,
  randomSearchOptimizerFactory,
  type Objective,
} from '@exharness/experiment'
import type { CliArgs, CliDeps } from '../cli.js'

function parsePositiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${value}"`)
  }
  return parsed
}

/**
 * Run a BOHB-vs-random-search experiment on a small analytic objective and
 * report the Welch t-test and Cohen's d, demonstrating the statistically
 * rigorous self-evolution loop without needing a live LLM.
 */
export async function experimentCommand(args: CliArgs, deps: CliDeps): Promise<number> {
  const trials = parsePositiveInt(args.options.get('trials'), 'trials', 5)

  const params: Param[] = [
    { type: 'float', name: 'x', min: -1, max: 1 },
    { type: 'float', name: 'y', min: -1, max: 1 },
    { type: 'categorical', name: 'mode', choices: ['good', 'bad'] },
  ]
  const objective: Objective = {
    async evaluate(config) {
      const dx = (config.x as number) - 0.3
      const dy = (config.y as number) + 0.2
      return dx * dx + dy * dy + (config.mode === 'good' ? 0 : 0.8)
    },
  }

  const result = await compareOptimizers({
    objective,
    methodA: bohbOptimizerFactory(params, 1, 9, 3),
    methodB: randomSearchOptimizerFactory(params, { budget: 9, evaluations: 10 }),
    trials,
  })

  const report = {
    methodA: result.methodA,
    methodB: result.methodB,
    meanA: result.meanA,
    meanB: result.meanB,
    meanDifference: result.meanDifference,
    pValue: result.pValue,
    cohensD: result.cohensD,
    significant: result.significant,
    trials: result.trials,
  }

  if (args.flags.has('json')) {
    deps.out(JSON.stringify(report))
  } else {
    deps.out(
      `BOHB mean loss ${report.meanA.toFixed(4)} vs RandomSearch ${report.meanB.toFixed(4)} ` +
        `(p=${report.pValue.toFixed(4)}, d=${report.cohensD.toFixed(3)}, significant=${report.significant})`,
    )
  }
  return 0
}
