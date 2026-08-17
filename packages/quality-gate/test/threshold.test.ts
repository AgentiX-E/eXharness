import { describe, expect, it } from 'vitest'
import { ThresholdGateRunner } from '../src/index.js'

describe('ThresholdGateRunner', () => {
  it('passes when value satisfies gte threshold', async () => {
    const runner = new ThresholdGateRunner({ name: 'coverage', value: 96, threshold: 95 })
    expect(await runner.run()).toEqual({
      name: 'coverage',
      status: 'passed',
      summary: 'value 96 >= 95',
      details: { value: 96, threshold: 95, direction: 'gte' },
    })
  })

  it('fails when value is below a gte threshold', async () => {
    const runner = new ThresholdGateRunner({ name: 'coverage', value: 94, threshold: 95 })
    const result = await runner.run()
    expect(result.status).toBe('failed')
  })

  it('supports lte direction', async () => {
    const pass = new ThresholdGateRunner({ name: 'latency', value: 200, threshold: 500, direction: 'lte' })
    expect((await pass.run()).status).toBe('passed')
    const fail = new ThresholdGateRunner({ name: 'latency', value: 600, threshold: 500, direction: 'lte' })
    expect((await fail.run()).status).toBe('failed')
    expect((await fail.run()).summary).toContain('<=')
  })

  it('rejects invalid configuration', () => {
    expect(() => new ThresholdGateRunner({ name: '', value: 1, threshold: 1 })).toThrow(/name/)
    expect(() => new ThresholdGateRunner({ name: 'x', value: NaN, threshold: 1 })).toThrow(/finite/)
    expect(() => new ThresholdGateRunner({ name: 'x', value: 1, threshold: Infinity })).toThrow(/finite/)
  })
})
