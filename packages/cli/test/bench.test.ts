import { describe, expect, it } from 'vitest'
import { MockProvider, type LlmProvider } from '@exharness/llm'
import { parseArgs } from '../src/args.js'
import { benchCommand, type CliDeps } from '../src/index.js'

function harness(llm: LlmProvider, overrides: Partial<CliDeps> = {}) {
  const out: string[] = []
  const err: string[] = []
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    env: {},
    createLlm: () => llm,
    ...overrides,
  }
  return { deps, out, err }
}

describe('benchCommand', () => {
  it('runs the built-in arithmetic benchmark', async () => {
    const llm = new MockProvider({ responses: ['5', '42', '6', '4', '11', '3'] })
    const { deps, out } = harness(llm)
    expect(await benchCommand(parseArgs(['bench']), deps)).toBe(0)
    expect(out[0]).toContain('6/6 correct')
    expect(out[0]).toContain('accuracy 100.0%')
  })

  it('emits JSON with --json', async () => {
    const llm = new MockProvider({ responses: ['5', '42', '6', '4', '11', '3'] })
    const { deps, out } = harness(llm)
    await benchCommand(parseArgs(['bench', '--json']), deps)
    const report = JSON.parse(out[0]!) as { accuracy: number; samples: number }
    expect(report.accuracy).toBe(1)
    expect(report.samples).toBe(6)
  })

  it('loads a gsm8k benchmark from JSONL', async () => {
    const llm = new MockProvider({ responses: ['2'] })
    const jsonl = '{"question":"What is 1+1?","answer":"2"}\n'
    const { deps, out } = harness(llm, { readFile: async () => jsonl })
    await benchCommand(parseArgs(['bench', 'gsm8k', '--file=x.jsonl']), deps)
    expect(out[0]).toContain('1/1 correct')
  })

  it('rejects an unknown benchmark', async () => {
    const { deps } = harness(new MockProvider())
    await expect(benchCommand(parseArgs(['bench', 'unknown']), deps)).rejects.toThrow(/unknown benchmark/)
  })

  it('requires --file for a gsm8k benchmark', async () => {
    const { deps } = harness(new MockProvider())
    await expect(benchCommand(parseArgs(['bench', 'gsm8k']), deps)).rejects.toThrow(/--file/)
  })

  it('requires a readFile implementation for a gsm8k benchmark', async () => {
    const { deps } = harness(new MockProvider())
    await expect(benchCommand(parseArgs(['bench', 'gsm8k', '--file=x.jsonl']), deps)).rejects.toThrow(/readFile/)
  })

  it('rejects malformed gsm8k JSONL entries', async () => {
    const { deps } = harness(new MockProvider(), { readFile: async () => '{"question":"x"}\n' })
    await expect(benchCommand(parseArgs(['bench', 'gsm8k', '--file=x.jsonl']), deps)).rejects.toThrow(
      /question.*answer/,
    )
  })
})
