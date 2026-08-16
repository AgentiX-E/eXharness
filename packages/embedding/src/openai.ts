import type { EmbeddingProvider } from './types.js'

export interface OpenAiCompatibleEmbeddingConfig {
  /** Base URL without the /embeddings suffix, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  apiKey: string
  model: string
  dimensions?: number
  defaultHeaders?: Record<string, string>
  fetchImpl?: typeof fetch
}

/**
 * A fetch-based embedding provider compatible with any OpenAI-style
 * `/embeddings` endpoint. No SDK dependency — works in Node and the browser.
 */
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'openai-compatible'
  readonly dimensions?: number

  constructor(private readonly config: OpenAiCompatibleEmbeddingConfig) {
    this.dimensions = config.dimensions
  }

  async embed(texts: string[]): Promise<number[][]> {
    const base = this.config.baseUrl.replace(/\/+$/, '')
    const fetchFn = this.config.fetchImpl ?? fetch
    const response = await fetchFn(`${base}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.defaultHeaders,
      },
      body: JSON.stringify({ model: this.config.model, input: texts }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Embedding request failed (${response.status}): ${text.slice(0, 500)}`)
    }
    const data = (await response.json()) as any
    const list: any[] = data.data ?? []
    return list
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding as number[])
  }
}
