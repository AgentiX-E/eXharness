import type { CliArgs, CliDeps } from '../cli.js'
import { parseTrials } from './common.js'
import { runSelfEvolutionComparison } from './self-evolution.js'

/**
 * Run a BOHB-vs-random-search experiment on a small analytic objective and
 * report the Welch t-test and Cohen's d, demonstrating the statistically
 * rigorous self-evolution loop without needing a live LLM.
 */
export async function experimentCommand(args: CliArgs, deps: CliDeps): Promise<number> {
  const trials = parseTrials(args.options.get('trials'), 5)
  const result = await runSelfEvolutionComparison(trials)

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
