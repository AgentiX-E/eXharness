import { describe, expect, it } from 'vitest'
import { MockProvider, type LlmProvider } from '@exharness/llm'
import type { HfFetch, HfFetchResponse } from '@exharness/benchmarks'
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

/** A mock HuggingFace fetch that returns MMLU rows for any subject. */
function mmluFetch(): HfFetch {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [
          { row: { question: 'q1', choices: ['a', 'b', 'c', 'd'], answer: 0 } },
          { row: { question: 'q2', choices: ['a', 'b', 'c', 'd'], answer: 2 } },
        ],
      }),
    }) as HfFetchResponse
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

  it('loads an MMLU benchmark from HuggingFace and scores it', async () => {
    const llm = new MockProvider({ responses: ['A', 'C'] })
    const { deps, out } = harness(llm, { fetch: mmluFetch() })
    await benchCommand(parseArgs(['bench', 'mmlu', '--samples=2', '--subjects=algebra']), deps)
    expect(out[0]).toContain('2/2 correct')
  })

  it('rejects an invalid --samples value', async () => {
    const { deps } = harness(new MockProvider(), { fetch: mmluFetch() })
    await expect(benchCommand(parseArgs(['bench', 'mmlu', '--samples=0']), deps)).rejects.toThrow(/positive integer/)
  })

  it('rejects empty --subjects', async () => {
    const { deps } = harness(new MockProvider(), { fetch: mmluFetch() })
    await expect(benchCommand(parseArgs(['bench', 'mmlu', '--subjects=,,']), deps)).rejects.toThrow(/non-empty/)
  })

  it('loads an IFEval benchmark from HuggingFace and scores it', async () => {
    const fetch: HfFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            {
              row: {
                prompt: 'Say hello.',
                instruction_id_list: ['length_constraints:number_words'],
                kwargs: [{ relation: 'at least', num_words: 1 }],
              },
            },
          ],
        }),
      }) as HfFetchResponse
    const llm = new MockProvider({ responses: ['hello'] })
    const { deps, out } = harness(llm, { fetch })
    await benchCommand(parseArgs(['bench', 'ifeval', '--samples=1']), deps)
    expect(out[0]).toContain('1/1 correct')
  })

  it('runs the HumanEval benchmark through a real python3 executor', async () => {
    const fetch: HfFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
      }) as HfFetchResponse
    const llm = new MockProvider({ responses: ['    return a + b\n'] })
    const { deps, out } = harness(llm, { fetch })
    await benchCommand(parseArgs(['bench', 'humaneval', '--samples=1']), deps)
    expect(out[0]).toContain('pass@1: 100.0%')
  })

  it('emits HumanEval JSON with --json', async () => {
    const fetch: HfFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
      }) as HfFetchResponse
    const llm = new MockProvider({ responses: ['    return a + b\n'] })
    const { deps, out } = harness(llm, { fetch })
    await benchCommand(parseArgs(['bench', 'humaneval', '--samples=1', '--json']), deps)
    const report = JSON.parse(out[0]!) as { name: string; passAt1: number }
    expect(report.name).toBe('humaneval')
    expect(report.passAt1).toBe(1)
  })

  it('rejects an invalid HumanEval --samples value', async () => {
    const { deps } = harness(new MockProvider(), { fetch: mmluFetch() })
    await expect(benchCommand(parseArgs(['bench', 'humaneval', '--samples=0']), deps)).rejects.toThrow(
      /positive integer/,
    )
  })
})
