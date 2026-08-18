import { describe, expect, it } from 'vitest'
import { createEmbeddingFromEnv, readEmbeddingEnv, resolveEnv } from '../src/index.js'

describe('resolveEnv', () => {
  it('reads process.env when present', () => {
    expect(resolveEnv({ process: { env: { K: 'v' } } })).toEqual({ K: 'v' })
  })

  it('falls back to an empty object when process.env is absent', () => {
    expect(resolveEnv({ process: {} })).toEqual({})
    expect(resolveEnv({})).toEqual({})
  })
})

describe('readEmbeddingEnv', () => {
  it('applies Zhipu GLM defaults when only the API key is set', () => {
    expect(readEmbeddingEnv({ EXHARNESS_EMBEDDING_API_KEY: 'k' })).toEqual({
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'k',
      model: 'embedding-3',
    })
  })

  it('honours explicit values', () => {
    expect(
      readEmbeddingEnv({
        EXHARNESS_EMBEDDING_BASE_URL: 'http://x/v4',
        EXHARNESS_EMBEDDING_API_KEY: 'k',
        EXHARNESS_EMBEDDING_MODEL: 'm',
      }),
    ).toEqual({ baseUrl: 'http://x/v4', apiKey: 'k', model: 'm' })
  })

  it('reads from process.env when no env is provided', () => {
    const original = process.env.EXHARNESS_EMBEDDING_API_KEY
    process.env.EXHARNESS_EMBEDDING_API_KEY = 'from-process'
    try {
      expect(readEmbeddingEnv().apiKey).toBe('from-process')
    } finally {
      if (original === undefined) delete process.env.EXHARNESS_EMBEDDING_API_KEY
      else process.env.EXHARNESS_EMBEDDING_API_KEY = original
    }
  })

  it('throws when the API key is missing or empty', () => {
    expect(() => readEmbeddingEnv({})).toThrow(/EXHARNESS_EMBEDDING_API_KEY/)
    expect(() => readEmbeddingEnv({ EXHARNESS_EMBEDDING_API_KEY: '' })).toThrow(/EXHARNESS_EMBEDDING_API_KEY/)
  })
})

describe('createEmbeddingFromEnv', () => {
  it('returns an openai-compatible provider', () => {
    const provider = createEmbeddingFromEnv({ EXHARNESS_EMBEDDING_API_KEY: 'k' })
    expect(provider.kind).toBe('openai-compatible')
  })
})
