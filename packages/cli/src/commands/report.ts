import {
  assembleCompetitiveReport,
  evaluateHumanEval,
  gsm8kBenchmark,
  humanEvalToBenchmarkResult,
  ifevalBenchmark,
  loadGsm8kFromHf,
  loadHumanEvalFromHf,
  loadIfEvalFromHf,
  loadMmluFromHf,
  multipleChoiceBenchmark,
  runBenchmarkSuite,
  type BenchmarkResult,
} from '@exharness/benchmarks'
import { LocalPythonExecutor } from '@exharness/benchmarks/code-executor'
import type { CliArgs, CliDeps } from '../cli.js'
import { hfSource, makeGenerate, parsePositiveInt, parseSubjects, parseTrials } from './common.js'
import { runSelfEvolutionComparison } from './self-evolution.js'

/**
 * Produce the full competitive-benchmark report: real benchmark scores (MMLU,
 * IFEval, GSM8K, HumanEval) plus the BOHB-vs-random-search self-evolution
 * significance test. The result is emitted as JSON with `--json` (the form the
 * benchmark workflow uploads as an artifact) or as a human-readable summary.
 */
export async function reportCommand(args: CliArgs, deps: CliDeps): Promise<number> {
  const model = deps.env.EXHARNESS_LLM_MODEL ?? 'deepseek-chat'
  const samples = parsePositiveInt(args.options.get('samples'), 'samples', 20)
  const trials = parseTrials(args.options.get('trials'), 3)
  const llm = deps.createLlm(deps.env)
  const source = hfSource(deps)

  const subjects = parseSubjects(args.options.get('subjects'))
  deps.err(`Loading MMLU (${subjects.length} subjects x ${samples}) ...`)
  const mmlu = multipleChoiceBenchmark('mmlu', await loadMmluFromHf(source, subjects, samples))
  deps.err(`Loading IFEval (${samples}) ...`)
  const ifeval = ifevalBenchmark('ifeval', await loadIfEvalFromHf(source, samples))
  deps.err(`Loading GSM8K (${samples}) ...`)
  const gsm8k = gsm8kBenchmark('gsm8k', await loadGsm8kFromHf(source, samples))

  deps.err('Running benchmarks (mmlu, ifeval, gsm8k) ...')
  const suite = await runBenchmarkSuite([mmlu, ifeval, gsm8k], makeGenerate(llm, model))

  deps.err(`Loading HumanEval (${samples}) ...`)
  const humanEvalTasks = await loadHumanEvalFromHf(source, samples)
  deps.err('Running HumanEval (pass@1, real python3) ...')
  const humanEvalResult = await evaluateHumanEval(humanEvalTasks, new LocalPythonExecutor(), makeGenerate(llm, model), {
    numSamples: 1,
    k: 1,
  })

  deps.err('Running self-evolution comparison (BOHB vs random) ...')
  const comparison = await runSelfEvolutionComparison(trials)

  const benchmarks: BenchmarkResult[] = [...suite.benchmarks, humanEvalToBenchmarkResult(humanEvalResult)]
  const report = assembleCompetitiveReport({
    model,
    suite: { ...suite, benchmarks },
    selfEvolution: comparison,
  })

  if (args.flags.has('json')) {
    deps.out(JSON.stringify(report, null, 2))
  } else {
    deps.out(`Competitive benchmark report (model: ${model})`)
    for (const benchmark of benchmarks) {
      const failed = benchmark.failedSamples > 0 ? `, failed=${benchmark.failedSamples}` : ''
      deps.out(
        `  ${benchmark.name}: ${(benchmark.accuracy * 100).toFixed(1)}% (${benchmark.correct}/${benchmark.samples}${failed})`,
      )
    }
    const evolution = report.selfEvolution
    deps.out(
      `  self-evolution: ${evolution.methodA} vs ${evolution.methodB} ` +
        `p=${evolution.pValue.toFixed(4)} d=${evolution.cohensD.toFixed(3)} significant=${evolution.significant}`,
    )
  }
  return 0
}
