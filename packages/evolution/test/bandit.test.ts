import { describe, expect, it } from 'vitest'
import { LinTs, LinUcb } from '../src/bandit.js'

function fixedContexts(...ids: string[]): Map<string, readonly number[]> {
  return new Map(ids.map((id) => [id, [1, 0]] as const))
}

describe('LinearBanditBase validation', () => {
  it('rejects invalid featureDim and regularization', () => {
    expect(() => new LinUcb({ featureDim: 0 })).toThrow(/positive integer/)
    expect(() => new LinUcb({ featureDim: 1.5 })).toThrow(/positive integer/)
    expect(() => new LinUcb({ featureDim: 2, regularization: 0 })).toThrow(/positive finite/)
    expect(() => new LinUcb({ featureDim: 2, regularization: -1 })).toThrow(/positive finite/)
  })

  it('rejects invalid exploration parameters', () => {
    expect(() => new LinUcb({ featureDim: 2, alpha: 0 })).toThrow(/positive finite/)
    expect(() => new LinTs({ featureDim: 2, explorationScale: -1 })).toThrow(/positive finite/)
  })

  it('manages arms and reports their ids', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    expect(bandit.armCount).toBe(0)
    bandit.addArm('a')
    bandit.addArm('a') // idempotent
    bandit.addArm('b')
    expect(bandit.armCount).toBe(2)
    expect(bandit.armIds).toEqual(['a', 'b'])
    expect(bandit.hasArm('a')).toBe(true)
    bandit.removeArm('a')
    expect(bandit.hasArm('a')).toBe(false)
    expect(bandit.armCount).toBe(1)
  })

  it('select requires arms and a context for every arm', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    expect(() => bandit.select(new Map())).toThrow(/no arms/)
    bandit.addArm('a')
    bandit.addArm('b')
    expect(() => bandit.select(fixedContexts('a'))).toThrow(/missing context/)
  })

  it('rejects feature vectors of the wrong dimension', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    bandit.addArm('a')
    expect(() => bandit.select(new Map([['a', [1]]]))).toThrow(/length 2/)
    expect(() => bandit.observe('a', [1, 2, 3], 1)).toThrow(/length 2/)
  })

  it('observe rejects unknown arms and non-finite rewards', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    expect(() => bandit.observe('missing', [1, 0], 1)).toThrow(/unknown arm/)
    bandit.addArm('a')
    expect(() => bandit.observe('a', [1, 0], Infinity)).toThrow(/finite/)
  })

  it('thetaHat throws for unknown arms', () => {
    expect(() => new LinUcb({ featureDim: 2 }).thetaHat('x')).toThrow(/unknown arm/)
  })
})

describe('LinUcb', () => {
  it('converges to the arm with higher mean reward', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    bandit.addArm('good')
    bandit.addArm('bad')
    for (let i = 0; i < 100; i++) {
      bandit.observe('good', [1, 0], 1)
      bandit.observe('bad', [1, 0], 0)
    }
    const thetaGood = bandit.thetaHat('good')
    const thetaBad = bandit.thetaHat('bad')
    expect(thetaGood[0]).toBeGreaterThan(0.9)
    expect(thetaBad[0]).toBeLessThan(0.1)
    expect(bandit.select(fixedContexts('good', 'bad'))).toBe('good')
  })

  it('learns distinct reward models from different contexts', () => {
    const bandit = new LinUcb({ featureDim: 2 })
    // Two arms with orthogonal contexts: only the second coordinate matters.
    bandit.addArm('high')
    bandit.addArm('low')
    for (let i = 0; i < 50; i++) {
      bandit.observe('high', [0, 1], 1)
      bandit.observe('low', [0, 1], 0)
    }
    expect(bandit.thetaHat('high')[1]).toBeGreaterThan(0.9)
    expect(bandit.thetaHat('low')[1]).toBeLessThan(0.1)
    const contexts = new Map([
      ['high', [0, 1]],
      ['low', [0, 1]],
    ] as const)
    expect(bandit.select(contexts)).toBe('high')
  })
})

describe('LinTs', () => {
  it('converges to the arm with higher mean reward', () => {
    const bandit = new LinTs({ featureDim: 2, seed: 7 })
    bandit.addArm('good')
    bandit.addArm('bad')
    for (let i = 0; i < 200; i++) {
      bandit.observe('good', [1, 0], 1)
      bandit.observe('bad', [1, 0], 0)
    }
    // With a converged posterior the sampled scores almost always favour "good".
    let goodWins = 0
    const contexts = fixedContexts('good', 'bad')
    for (let i = 0; i < 500; i++) if (bandit.select(contexts) === 'good') goodWins++
    expect(goodWins).toBeGreaterThan(450)
  })

  it('starts exploratory but is reproducible for a fixed seed', () => {
    const a = new LinTs({ featureDim: 1, seed: 42 })
    const b = new LinTs({ featureDim: 1, seed: 42 })
    a.addArm('x')
    b.addArm('x')
    const ctx = new Map([['x', [1]]] as const)
    expect(a.select(ctx)).toBe(b.select(ctx))
  })
})
