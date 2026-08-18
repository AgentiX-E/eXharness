import { describe, expect, it } from 'vitest'
import { createEmbeddingFromEnv } from '../src/index.js'

const apiKey = process.env.ZHIPU_API_KEY

/**
 * Live integration against the real Zhipu GLM embeddings endpoint. Skipped when
 * no API key is present; run with the `ZHIPU_API_KEY` secret configured to
 * verify the real transport.
 */
describe.skipIf(!apiKey)('Embedding live integration (Zhipu GLM)', () => {
  it('embeds a text into a finite, non-empty vector', async () => {
    const provider = createEmbeddingFromEnv()
    const vectors = await provider.embed(['hello world'])
    expect(vectors).toHaveLength(1)
    expect(vectors[0]!.length).toBeGreaterThan(0)
    expect(vectors[0]!.every((v) => Number.isFinite(v))).toBe(true)
  }, 30000)
})
