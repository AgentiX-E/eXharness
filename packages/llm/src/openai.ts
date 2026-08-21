import type { LlmGenerateOptions, LlmProvider, LlmResult } from './types.js'

export interface OpenAiCompatibleConfig {
  /** Base URL without the chat/completions suffix, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  apiKey: string
  /** Default model when a request does not specify one. */
  model?: string
  defaultHeaders?: Record<string, string>
  /** Injectable fetch for tests and non-standard runtimes. */
  fetchImpl?: typeof fetch
  /** Maximum retries for transient failures (429/5xx/network). Defaults to 0. */
  maxRetries?: number
  /** Base backoff delay in ms; doubles on each retry. Defaults to 500. */
  retryDelayMs?: number
  /** Per-request timeout in ms; an aborted request is a retryable transport error. */
  timeoutMs?: number
}

/** HTTP statuses worth retrying with backoff (transient server/rate-limit errors). */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff delay for the given attempt index (0-based). */
function backoffDelay(attempt: number, retryDelayMs: number): number {
  return retryDelayMs * 2 ** attempt
}

/** Parse a Retry-After header (seconds) into milliseconds, or null when absent/invalid. */
function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}

/**
 * A fetch-based provider compatible with any OpenAI-style `/chat/completions`
 * endpoint (OpenAI, DeepSeek, Ollama, vLLM, local servers, …).
 *
 * It is intentionally implemented over the platform `fetch` with **no SDK
 * dependency**, so it works identically in Node (>=20) and the browser and is
 * fully auditable. Transient HTTP/network failures are retried with exponential
 * backoff when `maxRetries` is configured, so long benchmark runs survive
 * sporadic rate-limit (429) or server (5xx) blips.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly kind = 'openai-compatible'

  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly timeoutMs?: number

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.maxRetries = config.maxRetries ?? 0
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error('OpenAiCompatibleProvider: maxRetries must be a non-negative integer')
    }
    this.retryDelayMs = config.retryDelayMs ?? 500
    if (!Number.isFinite(this.retryDelayMs) || this.retryDelayMs < 0) {
      throw new Error('OpenAiCompatibleProvider: retryDelayMs must be a non-negative finite number')
    }
    this.timeoutMs = config.timeoutMs
    if (this.timeoutMs !== undefined && (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)) {
      throw new Error('OpenAiCompatibleProvider: timeoutMs must be a positive finite number')
    }
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResult> {
    const base = this.config.baseUrl.replace(/\/+$/, '')
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      messages: options.messages,
    }
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
    if (options.stop !== undefined) body.stop = options.stop
    if (options.tools !== undefined) body.tools = options.tools
    if (options.jsonMode === true) body.response_format = { type: 'json_object' }

    const fetchFn = this.config.fetchImpl ?? fetch

    for (let attempt = 0; ; attempt++) {
      let response: Response
      const controller = new AbortController()
      const timer = this.timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        response = await fetchFn(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            ...this.config.defaultHeaders,
          },
          body: JSON.stringify(body),
          ...(this.timeoutMs === undefined ? {} : { signal: controller.signal }),
        })
      } catch (error) {
        // A transport error (ECONNRESET, "fetch failed", timeout abort, …) is retryable.
        if (attempt < this.maxRetries) {
          await sleep(backoffDelay(attempt, this.retryDelayMs))
          continue
        }
        throw error
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }

      if (response.ok) {
        const data = (await response.json()) as any
        const choice = data.choices?.[0]
        const message = choice?.message ?? {}
        return {
          content: typeof message.content === 'string' ? message.content : '',
          toolCalls: message.tool_calls,
          finishReason: choice?.finish_reason,
          usage:
            data.usage === undefined
              ? undefined
              : {
                  inputTokens: data.usage.prompt_tokens ?? 0,
                  outputTokens: data.usage.completion_tokens ?? 0,
                },
          raw: data,
        }
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
        await sleep(retryAfterMs ?? backoffDelay(attempt, this.retryDelayMs))
        continue
      }

      const text = await response.text().catch(() => '')
      throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 500)}`)
    }
  }
}
