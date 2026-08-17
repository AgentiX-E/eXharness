import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/rng.js'
import { TpeSampler, randomConfig, type Param } from '../src/tpe.js'

const floatX: Param = { type: 'float', name: 'x', min: 0, max: 1 }
const intN: Param = { type: 'int', name: 'n', min: 1, max: 10 }
const logF: Param = { type: 'float', name: 'lr', min: 1e-4, max: 1, log: true }
const logInt: Param = { type: 'int', name: 'steps', min: 1, max: 1000, log: true }
const catM: Param = { type: 'categorical', name: 'model', choices: ['a', 'b', 'c'] }

describe('randomConfig', () => {
  it('samples every parameter within its domain', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 200; i++) {
      const c = randomConfig([floatX, intN, logF, logInt, catM], rng)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(1)
      expect(Number.isInteger(c.n)).toBe(true)
      expect(c.n).toBeGreaterThanOrEqual(1)
      expect(c.n).toBeLessThanOrEqual(10)
      expect(c.lr).toBeGreaterThanOrEqual(1e-4)
      expect(c.lr).toBeLessThanOrEqual(1)
      expect(Number.isInteger(c.steps)).toBe(true)
      expect(c.steps).toBeGreaterThanOrEqual(1)
      expect(c.steps).toBeLessThanOrEqual(1000)
      expect(['a', 'b', 'c']).toContain(c.model)
    }
  })
})

describe('TpeSampler validation', () => {
  it('rejects invalid parameter spaces', () => {
    expect(() => new TpeSampler([])).toThrow(/at least one parameter/)
    expect(() => new TpeSampler([floatX, floatX])).toThrow(/duplicate parameter/)
    expect(() => new TpeSampler([{ type: 'float', name: 'x', min: 1, max: 1 }])).toThrow(/min < max/)
    expect(() => new TpeSampler([{ type: 'float', name: 'x', min: 0, max: 1, log: true }])).toThrow(/min > 0/)
    expect(() => new TpeSampler([{ type: 'categorical', name: 'c', choices: [] }])).toThrow(/no choices/)
  })

  it('rejects invalid sampler options', () => {
    expect(() => new TpeSampler([floatX], { quantile: 0 })).toThrow(/\(0, 1\)/)
    expect(() => new TpeSampler([floatX], { quantile: 1 })).toThrow(/\(0, 1\)/)
    expect(() => new TpeSampler([floatX], { rho: -0.1 })).toThrow(/\[0, 1\]/)
    expect(() => new TpeSampler([floatX], { nSamples: 0 })).toThrow(/positive integer/)
  })
})

describe('TpeSampler.suggest', () => {
  function observations(xs: number[]): { config: Record<string, number>; loss: number }[] {
    return xs.map((x) => ({ config: { x }, loss: Math.abs(x - 0.8) }))
  }

  it('falls back to random sampling with insufficient observations', () => {
    const sampler = new TpeSampler([floatX], { seed: 5 })
    for (let i = 0; i < 20; i++) {
      const c = sampler.suggest([]) as { x: number }
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(1)
    }
  })

  it('returns valid configurations from model-based sampling', () => {
    const sampler = new TpeSampler([floatX, intN, logF, catM], { seed: 6 })
    const obs = Array.from({ length: 30 }, (_, i) => {
      const c = {
        x: i / 29,
        n: (i % 10) + 1,
        lr: 1e-4 + (i / 29) * 0.9999,
        model: ['a', 'b', 'c'][i % 3]!,
      }
      return { config: c, loss: Math.abs(c.x - 0.8) + c.n * 0.01 }
    })
    for (let i = 0; i < 100; i++) {
      const c = sampler.suggest(obs)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(1)
      expect(Number.isInteger(c.n)).toBe(true)
      expect(c.lr).toBeGreaterThanOrEqual(1e-4)
      expect(c.lr).toBeLessThanOrEqual(1)
      expect(['a', 'b', 'c']).toContain(c.model)
    }
  })

  it('biases suggestions toward the low-loss region', () => {
    const sampler = new TpeSampler([floatX], { seed: 42 })
    const obs = observations(Array.from({ length: 30 }, (_, i) => i / 29))
    let sum = 0
    const n = 300
    for (let i = 0; i < n; i++) sum += (sampler.suggest(obs) as { x: number }).x
    const mean = sum / n
    // Model-based samples concentrate around x=0.8 (the optimum), whereas
    // uniform random sampling would average 0.5.
    expect(mean).toBeGreaterThan(0.6)
  })

  it('handles categories absent from the good set via Laplace smoothing', () => {
    const sampler = new TpeSampler([catM], { seed: 11 })
    // Only 'a' and 'b' ever appear, so the 'c' bucket exercises the ?? 0 branch.
    const obs = Array.from({ length: 12 }, (_, i) => ({
      config: { model: i % 2 === 0 ? 'a' : 'b' },
      loss: i,
    }))
    for (let i = 0; i < 50; i++) {
      const c = sampler.suggest(obs)
      expect(['a', 'b', 'c']).toContain(c.model)
    }
  })

  it('falls back to random sampling when the bad set is too small', () => {
    // rho=0 forces the model path; with only 3 observations the bad set holds a
    // single sample, which is too few for a KDE and must fall back gracefully.
    const sampler = new TpeSampler([floatX], { seed: 3, rho: 0 })
    const obs = [
      { config: { x: 0.1 }, loss: 0.1 },
      { config: { x: 0.2 }, loss: 0.2 },
      { config: { x: 0.3 }, loss: 0.3 },
    ]
    for (let i = 0; i < 20; i++) {
      const c = sampler.suggest(obs) as { x: number }
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(1)
    }
  })
})
