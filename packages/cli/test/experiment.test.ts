import { describe, expect, it } from 'vitest'
import { MockProvider } from '@exharness/llm'
import { parseArgs } from '../src/args.js'
import { experimentCommand, type CliDeps } from '../src/index.js'

function harness(overrides: Partial<CliDeps> = {}) {
  const out: string[] = []
  const err: string[] = []
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    env: {},
    createLlm: () => new MockProvider(),
    ...overrides,
  }
  return { deps, out, err }
}

describe('experimentCommand', () => {
  it('runs a BOHB-vs-random comparison and reports the statistics', async () => {
    const { deps, out } = harness()
    expect(await experimentCommand(parseArgs(['experiment', '--trials=3']), deps)).toBe(0)
    expect(out[0]).toContain('BOHB mean loss')
    expect(out[0]).toContain('RandomSearch')
    expect(out[0]).toContain('p=')
    expect(out[0]).toContain('d=')
  })

  it('emits JSON with --json', async () => {
    const { deps, out } = harness()
    await experimentCommand(parseArgs(['experiment', '--trials=3', '--json']), deps)
    const report = JSON.parse(out[0]!) as { pValue: number; cohensD: number; trials: number }
    expect(report.trials).toBe(3)
    expect(typeof report.pValue).toBe('number')
    expect(typeof report.cohensD).toBe('number')
  })

  it('uses the default trials when --trials is omitted', async () => {
    const { deps, out } = harness()
    expect(await experimentCommand(parseArgs(['experiment']), deps)).toBe(0)
    expect(out[0]).toContain('BOHB mean loss')
  })

  it('rejects an invalid trials value', async () => {
    const { deps } = harness()
    await expect(experimentCommand(parseArgs(['experiment', '--trials=0']), deps)).rejects.toThrow(/trials/)
  })
})
