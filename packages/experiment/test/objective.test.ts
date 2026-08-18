import { describe, expect, it } from 'vitest'
import { ArithmeticSolver, HarnessRunner, PredicateValidator, TemplatePrompt } from '@exharness/harness'
import { gsm8kBenchmark } from '@exharness/benchmarks'
import type { Config } from '@exharness/evolution'
import { makeBenchmarkObjective } from '../src/index.js'
import { arithmeticBenchmark, ArithmeticLlm } from './helpers.js'

function makeHarness(config: Config): HarnessRunner<string> {
  return new HarnessRunner({
    prompt: new TemplatePrompt('Solve: {task}'),
    validator: new PredicateValidator([{ name: 'nonempty', predicate: (s: string) => s.trim().length > 0 }]),
    solver: config.solver === 'on' ? new ArithmeticSolver() : undefined,
    temperature: config.temperature as number,
  })
}

describe('makeBenchmarkObjective', () => {
  it('returns zero loss when every sample is correct', async () => {
    const objective = makeBenchmarkObjective(arithmeticBenchmark(), new ArithmeticLlm(0, 0, 42), { makeHarness })
    const loss = await objective.evaluate({ solver: 'off', temperature: 0 }, 6)
    expect(loss).toBe(0)
  })

  it('makes the deterministic solver the optimal configuration', async () => {
    const llm = new ArithmeticLlm(0.1, 0.8, 7)
    const objective = makeBenchmarkObjective(arithmeticBenchmark(), llm, { makeHarness })
    const withSolver = await objective.evaluate({ solver: 'on', temperature: 0.5 }, 6)
    const withoutSolver = await objective.evaluate({ solver: 'off', temperature: 0.5 }, 6)
    expect(withSolver).toBe(0)
    expect(withoutSolver).toBeGreaterThan(0)
  })

  it('limits the number of evaluated samples by the budget', async () => {
    const objective = makeBenchmarkObjective(arithmeticBenchmark(), new ArithmeticLlm(0, 0, 1), { makeHarness })
    // Three samples, all correct → loss 0; this also exercises the subset path.
    const loss = await objective.evaluate({ solver: 'off', temperature: 0 }, 3)
    expect(loss).toBe(0)
  })

  it('rejects an invalid samples-per-budget mapping', async () => {
    const objective = makeBenchmarkObjective(arithmeticBenchmark(), new ArithmeticLlm(0, 0, 1), {
      makeHarness,
      samplesPerBudget: () => 0,
    })
    await expect(objective.evaluate({ solver: 'off', temperature: 0 }, 1)).rejects.toThrow(/positive integer/)
  })

  it('returns loss 1 for an empty benchmark', async () => {
    const objective = makeBenchmarkObjective(gsm8kBenchmark('empty', []), new ArithmeticLlm(0, 0, 1), {
      makeHarness,
    })
    const loss = await objective.evaluate({ solver: 'off', temperature: 0 }, 1)
    expect(loss).toBe(1)
  })
})
