import { describe, expect, it } from 'vitest'
import { createLlmFromEnv } from '../src/index.js'

const apiKey = process.env.DEEPSEEK_API_KEY

/**
 * Live integration against the real DeepSeek endpoint. Skipped when no API key
 * is present so the suite stays hermetic in offline/CI environments; run with
 * the `DEEPSEEK_API_KEY` secret configured to verify the real transport.
 */
describe.skipIf(!apiKey)('LLM live integration (DeepSeek)', () => {
  it('generates a non-empty completion with usage', async () => {
    const provider = createLlmFromEnv()
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      maxTokens: 16,
    })
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.usage).toBeDefined()
    expect(result.usage!.inputTokens).toBeGreaterThan(0)
    expect(result.usage!.outputTokens).toBeGreaterThan(0)
  }, 30000)
})
