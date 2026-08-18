import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BohbOptimizer, type Config, type Param } from '@exharness/evolution'
import { ArithmeticSolver, HarnessRunner, PredicateValidator, TemplatePrompt } from '@exharness/harness'
import { Tracer } from '@exharness/telemetry'
import { GitDriver } from '../../storage/src/git.js'
import {
  makeBenchmarkObjective,
  RandomSearchOptimizer,
  runExperiment,
  type Objective,
  type Optimizer,
} from '../src/index.js'
import { arithmeticBenchmark, ArithmeticLlm } from './helpers.js'

const params: Param[] = [
  { type: 'float', name: 'x', min: -1, max: 1 },
  { type: 'categorical', name: 'mode', choices: ['good', 'bad'] },
]

/** An analytic objective whose optimum is x=0, mode=good. */
const analyticObjective: Objective = {
  async evaluate(config: Config): Promise<number> {
    const x = config.x as number
    return x * x + (config.mode === 'good' ? 0 : 0.5)
  },
}

describe('runExperiment', () => {
  it('drives an optimizer to completion and reports the best loss', async () => {
    const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 3, eta: 2, seed: 1 })
    const result = await runExperiment({ optimizer: bohb, objective: analyticObjective, optimizerName: 'BOHB' })
    expect(result.optimizer).toBe('BOHB')
    expect(result.evaluations).toBeGreaterThan(0)
    expect(result.bestLoss).toBeLessThan(0.5)
    expect(result.bestConfig.mode).toBe('good')
    expect(result.traceId.length).toBeGreaterThan(0)
  })

  it('invokes the persistence callback with the final result', async () => {
    const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 3, eta: 2, seed: 2 })
    let persisted: unknown
    const result = await runExperiment({
      optimizer: bohb,
      objective: analyticObjective,
      optimizerName: 'BOHB',
      onResult: (r) => {
        persisted = r
      },
    })
    expect(persisted).toEqual(result)
  })

  it('records an experiment root and evaluate spans', async () => {
    const tracer = new Tracer()
    const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 3, eta: 2, seed: 3 })
    await runExperiment({ optimizer: bohb, objective: analyticObjective, optimizerName: 'BOHB', tracer })
    const spans = tracer.trace.spans
    expect(spans.length).toBeGreaterThan(1)
    expect(spans[0]!.name).toBe('experiment')
    expect(spans.some((s) => s.name === 'evaluate')).toBe(true)
  })

  it('marks the evaluate span as failed and rethrows objective errors', async () => {
    const throwing: Objective = {
      async evaluate(): Promise<number> {
        throw new Error('boom')
      },
    }
    const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 1, eta: 2, seed: 4 })
    const tracer = new Tracer()
    await expect(
      runExperiment({ optimizer: bohb, objective: throwing, optimizerName: 'BOHB', tracer }),
    ).rejects.toThrow('boom')
    const last = tracer.trace.spans[tracer.trace.spans.length - 1]!
    expect(last.status?.code).toBe('error')
  })

  it('runs the full benchmark + harness + deterministic-solver closed loop', async () => {
    const harnessParams: Param[] = [
      { type: 'float', name: 'temperature', min: 0, max: 1 },
      { type: 'categorical', name: 'solver', choices: ['on', 'off'] },
    ]
    const makeHarness = (config: Config) =>
      new HarnessRunner({
        prompt: new TemplatePrompt('Solve: {task}'),
        validator: new PredicateValidator([{ name: 'nonempty', predicate: (s: string) => s.trim().length > 0 }]),
        solver: config.solver === 'on' ? new ArithmeticSolver() : undefined,
        temperature: config.temperature as number,
      })
    const objective = makeBenchmarkObjective(arithmeticBenchmark(), new ArithmeticLlm(0.1, 0.8, 5), { makeHarness })
    const bohb = new BohbOptimizer({ params: harnessParams, minBudget: 1, maxBudget: 6, eta: 3, seed: 6 })
    const result = await runExperiment({ optimizer: bohb, objective, optimizerName: 'BOHB' })
    expect(result.bestConfig.solver).toBe('on')
    expect(result.bestLoss).toBe(0)
  })

  it('persists the traced experiment result to a Git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exharness-experiment-'))
    try {
      const git = new GitDriver({ dir })
      await git.init()
      const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 3, eta: 2, seed: 9 })
      const result = await runExperiment({
        optimizer: bohb,
        objective: analyticObjective,
        optimizerName: 'BOHB',
        onResult: async (r) => {
          await git.writeFile('result.json', JSON.stringify(r, null, 2))
          await git.commit('experiment result')
        },
      })
      const persisted = await git.readFile('result.json')
      expect(persisted).not.toBeNull()
      expect(JSON.parse(persisted!).bestLoss).toBe(result.bestLoss)
      expect(JSON.parse(persisted!).traceId).toBe(result.traceId)
      expect(await git.currentOid()).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses the optimizer class name when optimizerName is omitted', async () => {
    const random = new RandomSearchOptimizer({ params, evaluations: 2, seed: 5 })
    const result = await runExperiment({ optimizer: random, objective: analyticObjective })
    expect(result.optimizer).toBe('RandomSearchOptimizer')
  })

  it('handles an optimizer that terminates immediately with no best result', async () => {
    const empty: Optimizer = {
      suggest: () => null,
      observe: () => {},
      best: () => null,
    }
    const result = await runExperiment({ optimizer: empty, objective: analyticObjective, optimizerName: 'Empty' })
    expect(result.evaluations).toBe(0)
    expect(result.bestLoss).toBe(Number.POSITIVE_INFINITY)
    expect(result.bestConfig).toEqual({})
  })

  it('marks the span as failed for a non-Error throw', async () => {
    const throwing: Objective = {
      async evaluate(): Promise<number> {
        throw 'string-boom'
      },
    }
    const bohb = new BohbOptimizer({ params, minBudget: 1, maxBudget: 1, eta: 2, seed: 8 })
    const tracer = new Tracer()
    await expect(runExperiment({ optimizer: bohb, objective: throwing, optimizerName: 'BOHB', tracer })).rejects.toBe(
      'string-boom',
    )
    const last = tracer.trace.spans[tracer.trace.spans.length - 1]!
    expect(last.status?.code).toBe('error')
  })
})
