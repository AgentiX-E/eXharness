import { describe, expect, it } from 'vitest'
import { BohbOptimizer } from '../src/bohb.js'
import type { Param } from '../src/tpe.js'

const xParam: Param = { type: 'float', name: 'x', min: 0, max: 1 }

/** Run a full synchronous BOHB loop against a deterministic objective. */
function run(
  objective: (c: Record<string, number | string>) => number,
  params: Param[],
  budget: { min: number; max: number },
  seed = 1,
) {
  const optimizer = new BohbOptimizer({ params, minBudget: budget.min, maxBudget: budget.max, eta: 2, seed })
  let suggestion = optimizer.suggest()
  let count = 0
  while (suggestion !== null && count < 10000) {
    const loss = objective(suggestion.config)
    optimizer.observe({ config: suggestion.config, loss, budget: suggestion.budget })
    suggestion = optimizer.suggest()
    count++
  }
  expect(count).toBeLessThan(10000)
  return optimizer
}

describe('BohbOptimizer', () => {
  it('converges to the optimum of a unimodal objective', () => {
    const optimizer = run((c) => Math.abs((c.x as number) - 0.7), [xParam], { min: 1, max: 8 }, 3)
    const best = optimizer.best()!
    expect(best.loss).toBeLessThan(0.05)
    expect(best.config.x).toBeCloseTo(0.7, 1)
  })

  it('terminates after exploring every bracket', () => {
    const optimizer = run((c) => (c.x as number) ** 2, [xParam], { min: 1, max: 8 }, 5)
    expect(optimizer.suggest()).toBeNull()
  })

  it('returns null best before any observation', () => {
    const optimizer = new BohbOptimizer({ params: [xParam], minBudget: 1, maxBudget: 8 })
    expect(optimizer.best()).toBeNull()
  })

  it('rejects non-finite losses', () => {
    const optimizer = new BohbOptimizer({ params: [xParam], minBudget: 1, maxBudget: 8 })
    expect(() => optimizer.observe({ config: { x: 0.5 }, loss: NaN, budget: 1 })).toThrow(/finite/)
  })
})
