import {
  BenchmarkRunner,
  gsm8kBenchmark,
  ifevalBenchmark,
  loadHumanEvalFromHf,
  loadIfEvalFromHf,
  loadMmluFromHf,
  multipleChoiceBenchmark,
  parseJsonl,
  evaluateHumanEval,
  type Benchmark,
  type Gsm8kEntry,
} from '@exharness/benchmarks'
import { LocalPythonExecutor } from '@exharness/benchmarks/code-executor'
import type { LlmProvider } from '@exharness/llm'
import type { CliArgs, CliDeps } from '../cli.js'
import { hfSource, makeGenerate, parsePositiveInt, parseSubjects } from './common.js'

/** A small built-in arithmetic benchmark used as the default demo. */
const ARITHMETIC_SAMPLES: Gsm8kEntry[] = [
  { question: 'What is 2 + 3?', answer: '5' },
  { question: 'What is 7 * 6?', answer: '42' },
  { question: 'What is 10 - 4?', answer: '6' },
  { question: 'What is 20 / 5?', answer: '4' },
  { question: 'What is 3 + 4 * 2?', answer: '11' },
  { question: 'What is 9 - 2 * 3?', answer: '3' },
]

async function loadBenchmark(dataset: string, args: CliArgs, deps: CliDeps): Promise<Benchmark> {
  if (dataset === 'arithmetic') return gsm8kBenchmark('arithmetic', ARITHMETIC_SAMPLES)

  if (dataset === 'gsm8k') {
    const file = args.options.get('file')
    if (file === undefined) throw new Error('gsm8k benchmark requires --file=<path>')
    const readFile = deps.readFile
    if (readFile === undefined) throw new Error('gsm8k benchmark requires a readFile implementation')
    const entries = parseJsonl(await readFile(file)) as Gsm8kEntry[]
    if (entries.some((e) => typeof e.question !== 'string' || typeof e.answer !== 'string')) {
      throw new Error('gsm8k JSONL entries must have string "question" and "answer" fields')
    }
    return gsm8kBenchmark(
      'gsm8k',
      entries.map((e) => ({ question: e.question, answer: e.answer })),
    )
  }

  if (dataset === 'mmlu') {
    const samples = parsePositiveInt(args.options.get('samples'), 'samples', 20)
    const entries = await loadMmluFromHf(hfSource(deps), parseSubjects(args.options.get('subjects')), samples)
    return multipleChoiceBenchmark('mmlu', entries)
  }

  if (dataset === 'ifeval') {
    const samples = parsePositiveInt(args.options.get('samples'), 'samples', 20)
    const entries = await loadIfEvalFromHf(hfSource(deps), samples)
    return ifevalBenchmark('ifeval', entries)
  }

  throw new Error(`unknown benchmark "${dataset}"`)
}

/**
 * Run the HumanEval coding benchmark through a real `python3` executor (this
 * is a Node-only path, unlike the generic benchmark runner).
 */
async function runHumanEval(args: CliArgs, deps: CliDeps, llm: LlmProvider, model: string): Promise<number> {
  const samples = parsePositiveInt(args.options.get('samples'), 'samples', 5)
  const numSamples = parsePositiveInt(args.options.get('num-samples'), 'num-samples', 1)
  const tasks = await loadHumanEvalFromHf(hfSource(deps), samples)
  const result = await evaluateHumanEval(tasks, new LocalPythonExecutor(), makeGenerate(llm, model), {
    numSamples,
    k: 1,
  })

  const report = {
    name: 'humaneval',
    tasks: result.samples.length,
    totalN: result.totalN,
    totalC: result.totalC,
    passAt1: result.passAt1,
  }

  if (args.flags.has('json')) {
    deps.out(JSON.stringify(report))
  } else {
    deps.out(`HumanEval pass@1: ${(result.passAt1 * 100).toFixed(1)}% (${result.totalC}/${result.totalN} passed)`)
  }
  return 0
}

/**
 * Run a benchmark against a live (or injected) LLM and print the accuracy with
 * a bootstrap confidence interval.
 */
export async function benchCommand(args: CliArgs, deps: CliDeps): Promise<number> {
  const dataset = args.positionals[0] ?? 'arithmetic'
  const model = deps.env.EXHARNESS_LLM_MODEL ?? 'deepseek-chat'
  const llm = deps.createLlm(deps.env)

  if (dataset === 'humaneval') return runHumanEval(args, deps, llm, model)

  const benchmark = await loadBenchmark(dataset, args, deps)
  const runner = new BenchmarkRunner()
  const result = await runner.run(benchmark, makeGenerate(llm, model))

  const report = {
    name: result.name,
    samples: result.samples,
    correct: result.correct,
    accuracy: result.accuracy,
    meanScore: result.meanScore,
    confidenceInterval: result.confidenceInterval,
  }

  if (args.flags.has('json')) {
    deps.out(JSON.stringify(report))
  } else {
    deps.out(
      `Benchmark ${result.name}: ${result.correct}/${result.samples} correct ` +
        `(accuracy ${(result.accuracy * 100).toFixed(1)}%, 95% CI [${report.confidenceInterval.lower.toFixed(3)}, ${report.confidenceInterval.upper.toFixed(3)}])`,
    )
  }
  return 0
}
