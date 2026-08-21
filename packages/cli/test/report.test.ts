import { describe, expect, it } from 'vitest'
import { MockProvider, type LlmProvider } from '@exharness/llm'
import type { HfFetch, HfFetchResponse } from '@exharness/benchmarks'
import { parseArgs } from '../src/args.js'
import { reportCommand, type CliDeps } from '../src/index.js'

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

/** A mock HuggingFace fetch serving one sample per benchmark dataset. */
function suiteFetch(): HfFetch {
  return async (url) => {
    const encoded = /dataset=([^&]+)/.exec(url)?.[1] ?? ''
    const dataset = decodeURIComponent(encoded)
    let body: unknown
    if (dataset === 'cais/mmlu') {
      body = { rows: [{ row: { question: 'q1', choices: ['a', 'b', 'c', 'd'], answer: 0 } }] }
    } else if (dataset === 'google/IFEval') {
      body = {
        rows: [
          {
            row: {
              prompt: 'Say hello.',
              instruction_id_list: ['length_constraints:number_words'],
              kwargs: [{ relation: 'at least', num_words: 1 }],
            },
          },
        ],
      }
    } else if (dataset === 'openai/gsm8k') {
      body = { rows: [{ row: { question: 'What is 1+1?', answer: '#### 2' } }] }
    } else if (dataset === 'openai/openai_humaneval') {
      body = {
        rows: [
          {
            row: {
              task_id: 'HumanEval/0',
              prompt: 'def add(a, b):\n    """ Return a + b. """\n',
              test: 'def check(candidate):\n    assert candidate(1, 2) == 3\n',
              entry_point: 'add',
            },
          },
        ],
      }
    } else {
      throw new Error(`unexpected dataset "${dataset}"`)
    }
    return { ok: true, status: 200, json: async () => body } as HfFetchResponse
  }
}

describe('reportCommand', () => {
  it('emits the full competitive report as JSON', async () => {
    const llm = new MockProvider({ responses: ['A', 'hello', '2', '    return a + b\n'] })
    const { deps, out } = harness(llm, { fetch: suiteFetch() })
    await reportCommand(parseArgs(['report', '--samples=1', '--subjects=algebra', '--trials=2', '--json']), deps)
    const report = JSON.parse(out[0]!) as {
      model: string
      benchmarks: { name: string; accuracy: number }[]
      selfEvolution: { pValue: number; cohensD: number; trials: number }
    }
    expect(report.model).toBe('deepseek-chat')
    expect(report.benchmarks.map((b) => b.name)).toEqual(['mmlu', 'ifeval', 'gsm8k', 'humaneval'])
    expect(report.benchmarks.every((b) => b.accuracy === 1)).toBe(true)
    expect(report.selfEvolution.trials).toBe(2)
    expect(typeof report.selfEvolution.pValue).toBe('number')
    expect(typeof report.selfEvolution.cohensD).toBe('number')
  })

  it('emits a human-readable summary without --json', async () => {
    const llm = new MockProvider({ responses: ['A', 'hello', '2', '    return a + b\n'] })
    const { deps, out } = harness(llm, { fetch: suiteFetch() })
    await reportCommand(parseArgs(['report', '--samples=1', '--subjects=algebra', '--trials=2']), deps)
    expect(out[0]).toContain('Competitive benchmark report')
    expect(out[1]).toContain('mmlu: 100.0%')
    expect(out.some((line) => line.includes('self-evolution:'))).toBe(true)
  })

  it('flags failed samples in the human-readable summary', async () => {
    const failing: LlmProvider = {
      kind: 'mock',
      async generate() {
        throw new Error('boom')
      },
    }
    const { deps, out } = harness(failing, { fetch: suiteFetch() })
    await reportCommand(parseArgs(['report', '--samples=1', '--subjects=algebra', '--trials=2']), deps)
    expect(out.some((line) => line.includes('failed=1'))).toBe(true)
  })

  it('rejects an invalid --samples value', async () => {
    const { deps } = harness(new MockProvider(), { fetch: suiteFetch() })
    await expect(reportCommand(parseArgs(['report', '--samples=0']), deps)).rejects.toThrow(/positive integer/)
  })

  it('rejects an invalid --trials value', async () => {
    const { deps } = harness(new MockProvider(), { fetch: suiteFetch() })
    await expect(reportCommand(parseArgs(['report', '--samples=1', '--trials=0']), deps)).rejects.toThrow(
      /positive integer/,
    )
    await expect(reportCommand(parseArgs(['report', '--samples=1', '--trials=1']), deps)).rejects.toThrow(/>= 2/)
  })
})
