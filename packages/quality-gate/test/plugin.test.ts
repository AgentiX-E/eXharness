import { createRoot } from '@exharness/core'
import { describe, expect, it } from 'vitest'
import { QualityGateService, qualityGatePlugin } from '../src/index.js'

const passingRunner = { name: 'a', run: async () => ({ name: 'a', status: 'passed', summary: 'ok' }) as const }

describe('qualityGatePlugin', () => {
  it('mounts a QualityGateService and disposes it reversibly', async () => {
    const ctx = createRoot()
    const off = ctx.plugin(qualityGatePlugin([passingRunner]))

    const service = ctx.get('qualityGate')
    expect(service).toBeInstanceOf(QualityGateService)
    expect(service.runnerNames).toEqual(['a'])
    expect((await service.run()).passed).toBe(true)

    await off()
    expect(ctx.has('qualityGate')).toBe(false)
  })

  it('mounts with no runners', async () => {
    const ctx = createRoot()
    const off = ctx.plugin(qualityGatePlugin())
    expect(ctx.get('qualityGate').runnerNames).toEqual([])
    await off()
  })

  it('rejects mounting twice in the same scope', () => {
    const ctx = createRoot()
    ctx.plugin(qualityGatePlugin())
    expect(() => ctx.plugin(qualityGatePlugin())).toThrow(/already provided/)
  })
})
