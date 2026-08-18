import { describe, expect, it } from 'vitest'
import { createLlmFromEnv, readLlmEnv, resolveEnv } from '../src/index.js'

describe('resolveEnv', () => {
  it('reads process.env when present', () => {
    expect(resolveEnv({ process: { env: { K: 'v' } } })).toEqual({ K: 'v' })
  })

  it('falls back to an empty object when process.env is absent', () => {
    expect(resolveEnv({ process: {} })).toEqual({})
    expect(resolveEnv({})).toEqual({})
  })
})

describe('readLlmEnv', () => {
  it('applies DeepSeek-compatible defaults when only the API key is set', () => {
    expect(readLlmEnv({ DEEPSEEK_API_KEY: 'k' })).toEqual({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'k',
      model: 'deepseek-chat',
    })
  })

  it('honours explicit values', () => {
    expect(
      readLlmEnv({ EXHARNESS_LLM_BASE_URL: 'http://x/v1', DEEPSEEK_API_KEY: 'k', EXHARNESS_LLM_MODEL: 'm' }),
    ).toEqual({ baseUrl: 'http://x/v1', apiKey: 'k', model: 'm' })
  })

  it('reads from process.env when no env is provided', () => {
    const original = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'from-process'
    try {
      expect(readLlmEnv().apiKey).toBe('from-process')
    } finally {
      if (original === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = original
    }
  })

  it('throws when the API key is missing or empty', () => {
    expect(() => readLlmEnv({})).toThrow(/DEEPSEEK_API_KEY/)
    expect(() => readLlmEnv({ DEEPSEEK_API_KEY: '' })).toThrow(/DEEPSEEK_API_KEY/)
  })
})

describe('createLlmFromEnv', () => {
  it('returns an openai-compatible provider', () => {
    const provider = createLlmFromEnv({ DEEPSEEK_API_KEY: 'k' })
    expect(provider.kind).toBe('openai-compatible')
  })
})
