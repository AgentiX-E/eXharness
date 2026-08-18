import { describe, expect, it } from 'vitest'
import type { Param } from '@exharness/evolution'
import { RandomSearchOptimizer } from '../src/index.js'

const params: Param[] = [
  { type: 'float', name: 'x', min: 0, max: 1 },
  { type: 'categorical', name: 'mode', choices: ['a', 'b'] },
]

describe('RandomSearchOptimizer', () => {
  it('suggests in-domain configurations until the evaluation budget is exhausted', () => {
    const optimizer = new RandomSearchOptimizer({ params, evaluations: 5, seed: 1 })
    let count = 0
    let suggestion = optimizer.suggest()
    while (suggestion !== null) {
      expect(suggestion.budget).toBe(1)
      expect(suggestion.config.x).toBeGreaterThanOrEqual(0)
      expect(suggestion.config.x).toBeLessThanOrEqual(1)
      expect(['a', 'b']).toContain(suggestion.config.mode)
      optimizer.observe({ config: suggestion.config, loss: 0, budget: suggestion.budget })
      count++
      suggestion = optimizer.suggest()
    }
    expect(count).toBe(5)
    expect(optimizer.suggest()).toBeNull()
  })

  it('tracks the lowest-loss configuration observed', () => {
    const optimizer = new RandomSearchOptimizer({ params, evaluations: 3, seed: 2 })
    const first = optimizer.suggest()!
    optimizer.observe({ config: first.config, loss: 0.5, budget: first.budget })
    const second = optimizer.suggest()!
    optimizer.observe({ config: second.config, loss: 0.2, budget: second.budget })
    const third = optimizer.suggest()!
    optimizer.observe({ config: third.config, loss: 0.8, budget: third.budget })
    expect(optimizer.best()?.loss).toBe(0.2)
    expect(optimizer.best()?.config).toEqual(second.config)
  })

  it('rejects invalid construction', () => {
    expect(() => new RandomSearchOptimizer({ params: [], evaluations: 1 })).toThrow(/at least one parameter/)
    expect(() => new RandomSearchOptimizer({ params, evaluations: 0 })).toThrow(/positive integer/)
    expect(() => new RandomSearchOptimizer({ params, evaluations: 1, budget: -1 })).toThrow(/positive finite/)
  })

  it('rejects non-finite loss observations', () => {
    const optimizer = new RandomSearchOptimizer({ params, evaluations: 1 })
    const suggestion = optimizer.suggest()!
    expect(() => optimizer.observe({ config: suggestion.config, loss: Number.NaN, budget: suggestion.budget })).toThrow(
      /finite/,
    )
  })

  it('defaults to twenty evaluations on a unit budget', () => {
    const optimizer = new RandomSearchOptimizer({ params, seed: 3 })
    let count = 0
    let suggestion = optimizer.suggest()
    while (suggestion !== null) {
      expect(suggestion.budget).toBe(1)
      optimizer.observe({ config: suggestion.config, loss: 0, budget: suggestion.budget })
      count++
      suggestion = optimizer.suggest()
    }
    expect(count).toBe(20)
  })
})
