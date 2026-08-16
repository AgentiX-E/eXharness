import { describe, expect, it } from 'vitest'
import { CanaryController, MetricsCollector, ThompsonRouter, beta, gamma, mulberry32, standardNormal } from '../src/index.js'

describe('rng', () => {
  it('mulberry32 is deterministic and bounded', () => {
    const rng1 = mulberry32(42)
    const rng2 = mulberry32(42)
    const values = [rng1(), rng1(), rng1()]
    const again = [rng2(), rng2(), rng2()]
    expect(values).toEqual(again)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('beta and gamma samplers produce values in range', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const b = beta(rng, 2, 3)
      expect(b).toBeGreaterThan(0)
      expect(b).toBeLessThan(1)
      const g = gamma(rng, 2)
      expect(g).toBeGreaterThan(0)
    }
  })

  it('gamma and beta throw for shape < 1', () => {
    const rng = mulberry32(1)
    expect(() => gamma(rng, 0.5)).toThrow(/shape >= 1/)
    expect(() => beta(rng, 0.5, 1)).toThrow(/>= 1/)
  })

  it('standardNormal is roughly zero-mean', () => {
    const rng = mulberry32(3)
    let sum = 0
    for (let i = 0; i < 5000; i++) sum += standardNormal(rng)
    expect(Math.abs(sum / 5000)).toBeLessThan(0.1)
  })
})

describe('MetricsCollector', () => {
  it('accumulates success rate, latency and cost', () => {
    const collector = new MetricsCollector()
    collector.observe({ harnessId: 'a', success: true, latencyMs: 10, costUsd: 0.1 })
    collector.observe({ harnessId: 'a', success: false, latencyMs: 30, costUsd: 0.3 })
    const metrics = collector.get('a')
    expect(metrics.trials).toBe(2)
    expect(metrics.successes).toBe(1)
    expect(metrics.successRate).toBeCloseTo(0.5)
    expect(metrics.avgLatencyMs).toBeCloseTo(20)
    expect(metrics.avgCostUsd).toBeCloseTo(0.2)
  })

  it('all() returns metrics for every observed harness', () => {
    const collector = new MetricsCollector()
    collector.observe({ harnessId: 'a', success: true, latencyMs: 1, costUsd: 0.1 })
    collector.observe({ harnessId: 'b', success: false, latencyMs: 2, costUsd: 0.2 })
    expect(collector.all()).toHaveLength(2)
  })

  it('get() on an unknown harness returns zeroed metrics', () => {
    expect(new MetricsCollector().get('unknown').trials).toBe(0)
  })
})

describe('ThompsonRouter', () => {
  it('requires at least one arm before selecting', () => {
    const router = new ThompsonRouter()
    expect(() => router.select()).toThrow(/no arms/)
  })

  it('favours the arm with more observed successes', () => {
    const router = new ThompsonRouter({ seed: 1 })
    router.addArm('good')
    router.addArm('bad')
    for (let i = 0; i < 50; i++) router.observe('good', true)
    for (let i = 0; i < 50; i++) router.observe('bad', false)
    let goodWins = 0
    for (let i = 0; i < 500; i++) if (router.select() === 'good') goodWins++
    expect(goodWins).toBeGreaterThan(450)
  })

  it('rejects observations for unknown arms', () => {
    const router = new ThompsonRouter()
    expect(() => router.observe('missing', true)).toThrow(/unknown arm/)
  })

  it('addArm is idempotent and removeArm removes an arm', () => {
    const router = new ThompsonRouter()
    router.addArm('a')
    router.addArm('a')
    router.removeArm('a')
    expect(() => router.select()).toThrow(/no arms/)
  })

  it('posterior throws for an unknown arm', () => {
    expect(() => new ThompsonRouter().posterior('x')).toThrow(/unknown arm/)
  })
})

describe('CanaryController', () => {
  it('routes traffic and reaches a promotion decision for a clearly-better candidate', () => {
    const canary = new CanaryController({
      baselineId: 'v1',
      candidateId: 'v2',
      p0: 0.5,
      p1: 0.8,
      alpha: 0.05,
      beta: 0.2,
      seed: 9,
    })
    // Deterministic outcome: the candidate always succeeds and the baseline
    // always fails, so Thompson routing converges to the candidate and SPRT
    // must reach a promotion decision quickly and reproducibly.
    let decision = canary.decision()
    let steps = 0
    while (decision === 'continue' && steps < 1000) {
      const arm = canary.route()
      canary.observe(arm, arm === 'v2')
      decision = canary.decision()
      steps++
    }
    expect(canary.decision()).toBe('accept-alternative')
    expect(canary.sprtState.successes).toBeGreaterThan(0)
  })

  it('exposes posterior parameters and initial SPRT state', () => {
    const canary = new CanaryController({ baselineId: 'b', candidateId: 'c', p0: 0.5, p1: 0.6 })
    expect(canary.posterior('b')).toEqual({ alpha: 1, beta: 1 })
    expect(canary.sprtState.decision).toBe('continue')
    expect(canary.decision()).toBe('continue')
  })
})
