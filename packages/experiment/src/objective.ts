import type { Benchmark } from '@exharness/benchmarks'
import type { HarnessRunner } from '@exharness/harness'
import type { LlmProvider } from '@exharness/llm'
import type { Config } from '@exharness/evolution'
import type { Objective } from './types.js'

export interface BenchmarkObjectiveOptions {
  /** Build a harness runner for a configuration (temperature, solver, …). */
  makeHarness: (config: Config) => HarnessRunner<string>
  /** Maps a budget to the number of benchmark samples to evaluate (defaults to round(budget)). */
  samplesPerBudget?: (budget: number) => number
}

/**
 * Turn a benchmark + harness factory + LLM into an optimizable objective. The
 * loss is the benchmark error rate (1 − accuracy) over the first
 * `samplesPerBudget(budget)` samples, so larger budgets evaluate on more data
 * (the resource axis used by Hyperband's successive halving).
 */
export function makeBenchmarkObjective(
  benchmark: Benchmark,
  llm: LlmProvider,
  options: BenchmarkObjectiveOptions,
): Objective {
  const samplesPerBudget = options.samplesPerBudget ?? ((budget: number) => Math.max(1, Math.round(budget)))
  return {
    async evaluate(config: Config, budget: number): Promise<number> {
      const count = samplesPerBudget(budget)
      if (!Number.isInteger(count) || count < 1) {
        throw new Error('makeBenchmarkObjective: samplesPerBudget must yield a positive integer')
      }
      const samples = (await benchmark.dataset.load()).slice(0, count)
      if (samples.length === 0) return 1
      const runner = options.makeHarness(config)
      let correct = 0
      for (const sample of samples) {
        const output = await runner.run(llm, { task: sample.input })
        const score = benchmark.scorer.score(sample, String(output.result))
        if (score.correct) correct++
      }
      return 1 - correct / samples.length
    },
  }
}
