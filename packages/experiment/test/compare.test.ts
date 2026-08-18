import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@exharness/evolution'
import type { Config, Param } from '@exharness/evolution'
import {
  bohbOptimizerFactory,
  compareOptimizers,
  randomSearchOptimizerFactory,
  type Objective,
  type Optimizer,
  type OptimizerFactory,
  type OptimizerResult,
} from '../src/index.js'

/**
 * A deterministic optimizer whose per-trial losses are seeded around a base
 * value. It lets the significance machinery be tested with a known effect size
 * instead of a noisy optimizer.
 */
function lossOptimizer(baseLoss: number, spread: number): OptimizerFactory {
  return {
    name: `loss-${baseLoss}`,
    create: (seed) => {
      const rng = mulberry32(seed)
      const losses = Array.from({ length: 5 }, () => baseLoss + (rng() * 2 - 1) * spread)
      let cursor = 0
      let best: OptimizerResult | null = null
      const optimizer: Optimizer = {
        suggest: () => (cursor < losses.length ? { config: { loss: losses[cursor]! }, budget: 1 } : null),
        observe: (result) => {
          cursor++
          if (best === null || result.loss < best.loss) {
            best = { config: { ...result.config }, loss: result.loss, budget: result.budget }
          }
        },
        best: () => best,
      }
      return optimizer
    },
  }
}

const lossObjective: Objective = {
  async evaluate(config: Config): Promise<number> {
    return config.loss as number
  },
}

describe('compareOptimizers', () => {
  it('detects a significant mean difference between two known distributions', async () => {
    const result = await compareOptimizers({
      objective: lossObjective,
      methodA: lossOptimizer(0.1, 0.04),
      methodB: lossOptimizer(0.5, 0.04),
      trials: 10,
      seed: 1,
    })
    expect(result.aLosses).toHaveLength(10)
    expect(result.bLosses).toHaveLength(10)
    expect(result.meanA).toBeLessThan(result.meanB)
    expect(result.meanDifference).toBeLessThan(0)
    expect(result.cohensD).toBeLessThan(0)
    expect(result.significant).toBe(true)
    expect(result.pValue).toBeLessThan(0.05)
  })

  it('reports a non-significant result for overlapping distributions', async () => {
    const result = await compareOptimizers({
      objective: lossObjective,
      methodA: lossOptimizer(0.3, 0.2),
      methodB: lossOptimizer(0.32, 0.2),
      trials: 8,
      seed: 2,
    })
    expect(result.significant).toBe(false)
    expect(result.pValue).toBeGreaterThanOrEqual(0.05)
  })

  it('rejects invalid trials and alpha', async () => {
    const a = lossOptimizer(0, 0)
    await expect(compareOptimizers({ objective: lossObjective, methodA: a, methodB: a, trials: 1 })).rejects.toThrow(
      /trials/,
    )
    await expect(
      compareOptimizers({ objective: lossObjective, methodA: a, methodB: a, trials: 2, alpha: 0 }),
    ).rejects.toThrow(/alpha/)
  })

  it('uses default trials and seed', async () => {
    const result = await compareOptimizers({
      objective: lossObjective,
      methodA: lossOptimizer(0.1, 0.02),
      methodB: lossOptimizer(0.4, 0.02),
    })
    expect(result.trials).toBe(5)
    expect(result.aLosses).toHaveLength(5)
    expect(result.bLosses).toHaveLength(5)
  })

  it('runs the real BOHB-vs-random comparison and reports BOHB as lower on average', async () => {
    const params: Param[] = [
      { type: 'float', name: 'x', min: -1, max: 1 },
      { type: 'float', name: 'y', min: -1, max: 1 },
    ]
    const objective: Objective = {
      async evaluate(config: Config): Promise<number> {
        const dx = (config.x as number) - 0.3
        const dy = (config.y as number) + 0.2
        return dx * dx + dy * dy
      },
    }
    const result = await compareOptimizers({
      objective,
      methodA: bohbOptimizerFactory(params, 1, 27, 3),
      methodB: randomSearchOptimizerFactory(params, { budget: 27, evaluations: 20 }),
      trials: 4,
      seed: 42,
    })
    expect(result.methodA).toBe('BOHB')
    expect(result.methodB).toBe('RandomSearch')
    expect(result.meanA).toBeLessThan(result.meanB)
  })
})
