import { OpenAiCompatibleProvider } from './openai.js'

/**
 * Environment variable names for the pluggable LLM factory. API keys are read
 * ONLY from the environment (typically a CI secret) and never from code or
 * committed config.
 */
export const LLM_ENV_KEYS = {
  baseUrl: 'EXHARNESS_LLM_BASE_URL',
  apiKey: 'DEEPSEEK_API_KEY',
  model: 'EXHARNESS_LLM_MODEL',
  timeoutMs: 'EXHARNESS_LLM_TIMEOUT_MS',
} as const

/** Default per-request timeout applied to production benchmark runs (2 minutes). */
export const DEFAULT_LLM_TIMEOUT_MS = 120000

export interface LlmEnvConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

/** Parse a positive-integer millisecond timeout, throwing on a malformed value. */
function parseTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.length === 0) return DEFAULT_LLM_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`createLlmFromEnv: ${LLM_ENV_KEYS.timeoutMs} must be a positive integer, got "${value}"`)
  }
  return parsed
}

/** Resolve the environment map from a global object (`process.env` in Node, `{}` in browsers). */
export function resolveEnv(
  global: { process?: { env?: Record<string, string | undefined> } } = globalThis as never,
): Record<string, string | undefined> {
  return global.process?.env ?? {}
}

/**
 * Read the LLM configuration from environment variables. The base URL and
 * model have DeepSeek-compatible defaults; the API key is required and a
 * missing/empty key is a hard error.
 */
export function readLlmEnv(env: Record<string, string | undefined> = resolveEnv()): LlmEnvConfig {
  const baseUrl = env[LLM_ENV_KEYS.baseUrl] ?? 'https://api.deepseek.com/v1'
  const model = env[LLM_ENV_KEYS.model] ?? 'deepseek-chat'
  const apiKey = env[LLM_ENV_KEYS.apiKey]
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(`createLlmFromEnv: ${LLM_ENV_KEYS.apiKey} is required`)
  }
  const timeoutMs = parseTimeoutMs(env[LLM_ENV_KEYS.timeoutMs])
  return { baseUrl, apiKey, model, timeoutMs }
}

/** Build an OpenAI-compatible LLM provider from environment variables. */
export function createLlmFromEnv(env?: Record<string, string | undefined>): OpenAiCompatibleProvider {
  const config = readLlmEnv(env)
  return new OpenAiCompatibleProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    // Benchmark runs make many sequential calls; tolerate sporadic rate-limit
    // (429) and server (5xx) blips with exponential backoff, and bound each
    // request with a timeout so a hung/queued call cannot stall the whole run.
    maxRetries: 5,
    retryDelayMs: 500,
    timeoutMs: config.timeoutMs,
  })
}
