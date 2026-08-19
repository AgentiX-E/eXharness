import { describe, expect, it } from 'vitest'
import {
  fetchHfRows,
  loadGsm8kFromHf,
  loadHumanEvalFromHf,
  loadIfEvalFromHf,
  loadMmluFromHf,
  type HfFetch,
  type HfFetchResponse,
} from '../src/hf.js'

/** A configurable mock fetch that records URLs and returns a canned body. */
function mockFetch(handler: (url: string) => unknown): { fetch: HfFetch; calls: string[] } {
  const calls: string[] = []
  const fetch: HfFetch = async (url, _init) => {
    calls.push(url)
    const body = handler(url)
    return { ok: true, status: 200, json: async () => body } as HfFetchResponse
  }
  return { fetch, calls }
}

const okBody = (rows: Record<string, unknown>[]): unknown => ({ rows: rows.map((row) => ({ row })) })

describe('fetchHfRows', () => {
  it('constructs the rows URL and extracts row objects', async () => {
    const { fetch, calls } = mockFetch(() => okBody([{ a: 1 }, { a: 2 }]))
    const rows = await fetchHfRows({ fetch }, 'cais/mmlu', 'abstract_algebra', 'test', 2, 0)
    expect(rows).toEqual([{ a: 1 }, { a: 2 }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('dataset=cais%2Fmmlu')
    expect(calls[0]).toContain('config=abstract_algebra')
    expect(calls[0]).toContain('split=test')
    expect(calls[0]).toContain('offset=0')
    expect(calls[0]).toContain('length=2')
  })

  it('sends a bearer token when provided', async () => {
    let headers: Record<string, string> | undefined
    const fetch: HfFetch = async (_url, init) => {
      headers = init?.headers
      return { ok: true, status: 200, json: async () => okBody([]) } as HfFetchResponse
    }
    await fetchHfRows({ fetch, token: 'secret' }, 'd', 'c', 's', 1)
    expect(headers).toEqual({ Authorization: 'Bearer secret' })
  })

  it('throws on a non-2xx response', async () => {
    const fetch: HfFetch = async () => ({ ok: false, status: 429, json: async () => ({}) }) as HfFetchResponse
    await expect(fetchHfRows({ fetch }, 'd', 'c', 's', 1)).rejects.toThrow(/429/)
  })

  it('returns an empty array when the response has no rows field', async () => {
    const fetch: HfFetch = async () => ({ ok: true, status: 200, json: async () => ({}) }) as HfFetchResponse
    const rows = await fetchHfRows({ fetch }, 'd', 'c', 's', 1)
    expect(rows).toEqual([])
  })

  it('rejects invalid limit and offset', async () => {
    const { fetch } = mockFetch(() => okBody([]))
    await expect(fetchHfRows({ fetch }, 'd', 'c', 's', 0)).rejects.toThrow(/positive integer/)
    await expect(fetchHfRows({ fetch }, 'd', 'c', 's', 1, -1)).rejects.toThrow(/non-negative/)
  })

  it('falls back to globalThis.fetch when no fetch is injected', async () => {
    const original = globalThis.fetch
    const called: string[] = []
    globalThis.fetch = ((url: string) => {
      called.push(url)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) as Promise<Response>
    }) as typeof globalThis.fetch
    try {
      await expect(fetchHfRows({}, 'd', 'c', 's', 1)).rejects.toThrow(/404/)
      expect(called).toHaveLength(1)
      expect(called[0]).toContain('datasets-server.huggingface.co')
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('loadMmluFromHf', () => {
  it('normalises the numeric answer index to a letter', async () => {
    const { fetch } = mockFetch((url) => {
      if (url.includes('config=algebra')) {
        return okBody([
          { question: 'q1', choices: ['0', '4', '2', '6'], answer: 1 },
          { question: 'q2', choices: ['a', 'b', 'c', 'd'], answer: 3 },
        ])
      }
      return okBody([{ question: 'q3', choices: ['x', 'y', 'z', 'w'], answer: 0 }])
    })
    const entries = await loadMmluFromHf({ fetch }, ['algebra', 'logic'], 2)
    expect(entries).toEqual([
      { question: 'q1', choices: ['0', '4', '2', '6'], answer: 'B' },
      { question: 'q2', choices: ['a', 'b', 'c', 'd'], answer: 'D' },
      { question: 'q3', choices: ['x', 'y', 'z', 'w'], answer: 'A' },
    ])
  })

  it('rejects empty subjects and invalid limit', async () => {
    const { fetch } = mockFetch(() => okBody([]))
    await expect(loadMmluFromHf({ fetch }, [], 2)).rejects.toThrow(/non-empty/)
    await expect(loadMmluFromHf({ fetch }, ['a'], 0)).rejects.toThrow(/positive integer/)
  })

  it('rejects an out-of-range answer index', async () => {
    const { fetch } = mockFetch(() => okBody([{ question: 'q', choices: ['a', 'b'], answer: 5 }]))
    await expect(loadMmluFromHf({ fetch }, ['a'], 1)).rejects.toThrow(/out of range/)
  })

  it('rejects a malformed row shape', async () => {
    const { fetch } = mockFetch(() => okBody([{ question: 'q', choices: 'nope', answer: 0 }]))
    await expect(loadMmluFromHf({ fetch }, ['a'], 1)).rejects.toThrow(/unexpected row shape/)
  })
})

describe('loadIfEvalFromHf', () => {
  it('maps prompt, instruction_id_list and kwargs', async () => {
    const { fetch } = mockFetch(() =>
      okBody([
        {
          prompt: 'p',
          instruction_id_list: ['punctuation:no_comma'],
          kwargs: [{ relation: null, num_words: null }],
        },
      ]),
    )
    const entries = await loadIfEvalFromHf({ fetch }, 1)
    expect(entries).toEqual([
      { prompt: 'p', instruction_id_list: ['punctuation:no_comma'], kwargs: [{ relation: null, num_words: null }] },
    ])
  })

  it('rejects a malformed row', async () => {
    const { fetch } = mockFetch(() => okBody([{ prompt: 'p', instruction_id_list: 'x', kwargs: [] }]))
    await expect(loadIfEvalFromHf({ fetch }, 1)).rejects.toThrow(/unexpected row shape/)
  })
})

describe('loadGsm8kFromHf', () => {
  it('maps question and answer', async () => {
    const { fetch } = mockFetch(() => okBody([{ question: 'q', answer: 'a #### 18' }]))
    const entries = await loadGsm8kFromHf({ fetch }, 1)
    expect(entries).toEqual([{ question: 'q', answer: 'a #### 18' }])
  })

  it('rejects a malformed row', async () => {
    const { fetch } = mockFetch(() => okBody([{ question: 1, answer: 'a' }]))
    await expect(loadGsm8kFromHf({ fetch }, 1)).rejects.toThrow(/unexpected row shape/)
  })
})

describe('loadHumanEvalFromHf', () => {
  it('maps task_id, prompt, test and entry_point into HumanEvalSample', async () => {
    const { fetch } = mockFetch(() =>
      okBody([
        {
          task_id: 'HumanEval/0',
          prompt: 'def f():\n',
          canonical_solution: '    return 1\n',
          test: 'def check(c):\n    pass\n',
          entry_point: 'f',
        },
      ]),
    )
    const samples = await loadHumanEvalFromHf({ fetch }, 1)
    expect(samples).toEqual([
      { taskId: 'HumanEval/0', prompt: 'def f():\n', test: 'def check(c):\n    pass\n', entryPoint: 'f' },
    ])
  })

  it('rejects a malformed row', async () => {
    const { fetch } = mockFetch(() => okBody([{ task_id: 'x', prompt: 'p', test: 't' }]))
    await expect(loadHumanEvalFromHf({ fetch }, 1)).rejects.toThrow(/unexpected row shape/)
  })
})
