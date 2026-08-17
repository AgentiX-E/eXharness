import { describe, expect, it } from 'vitest'
import { QualityGateService, aggregateReport, type GateCheckResult, type GateRunner } from '../src/index.js'

function passed(name: string): GateCheckResult {
  return { name, status: 'passed', summary: 'ok' }
}

describe('aggregateReport', () => {
  it('passes only when no check fails or errors', () => {
    expect(aggregateReport([passed('a'), passed('b')]).passed).toBe(true)
    expect(aggregateReport([passed('a'), { name: 'b', status: 'failed', summary: 'x' }]).passed).toBe(false)
    expect(aggregateReport([passed('a'), { name: 'b', status: 'error', summary: 'x' }]).passed).toBe(false)
  })

  it('counts each status and preserves check order', () => {
    const report = aggregateReport([
      passed('a'),
      { name: 'b', status: 'failed', summary: 'x' },
      { name: 'c', status: 'error', summary: 'y' },
      passed('d'),
    ])
    expect(report.passedCount).toBe(2)
    expect(report.failedCount).toBe(1)
    expect(report.errorCount).toBe(1)
    expect(report.checks.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('passes an empty check list', () => {
    const report = aggregateReport([])
    expect(report.passed).toBe(true)
    expect(report.passedCount).toBe(0)
  })
})

describe('QualityGateService', () => {
  it('runs every runner and aggregates results', async () => {
    const service = new QualityGateService([
      { name: 'a', run: async () => passed('a') },
      { name: 'b', run: async () => ({ name: 'b', status: 'failed', summary: 'no' }) },
    ])
    const report = await service.run()
    expect(report.passed).toBe(false)
    expect(report.failedCount).toBe(1)
    expect(report.checks).toHaveLength(2)
  })

  it('converts a throwing runner into an error check', async () => {
    const service = new QualityGateService([
      { name: 'boom', run: async () => Promise.reject(new Error('kaboom')) },
      { name: 'string', run: async () => Promise.reject('plain string') },
    ])
    const report = await service.run()
    expect(report.passed).toBe(false)
    expect(report.errorCount).toBe(2)
    expect(report.checks[0]!.summary).toBe('kaboom')
    expect(report.checks[1]!.summary).toBe('plain string')
  })

  it('supports hot-add and hot-remove of runners', async () => {
    const service = new QualityGateService()
    expect(service.runnerNames).toEqual([])
    const remove = service.add({ name: 'a', run: async () => passed('a') })
    expect(service.has('a')).toBe(true)
    expect(service.runnerNames).toEqual(['a'])
    expect((await service.run()).passed).toBe(true)
    await remove()
    await remove() // idempotent
    expect(service.has('a')).toBe(false)
    expect(service.runnerNames).toEqual([])
  })

  it('rejects duplicate runner names', () => {
    const service = new QualityGateService([{ name: 'a', run: async () => passed('a') }])
    expect(() => service.add({ name: 'a', run: async () => passed('a') })).toThrow(/already registered/)
  })

  it('remove returns false for an unknown runner', () => {
    expect(new QualityGateService().remove('missing')).toBe(false)
  })

  it('passes the context through to runners', async () => {
    const runner: GateRunner = {
      name: 'ctx',
      run: async (context) => ({ name: 'ctx', status: 'passed', summary: String(context.cwd) }),
    }
    const service = new QualityGateService([runner])
    const report = await service.run({ cwd: '/tmp/x' })
    expect(report.checks[0]!.summary).toBe('/tmp/x')
  })
})
