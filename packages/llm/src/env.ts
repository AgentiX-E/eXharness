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
} as const

export interface LlmEnvConfig {
  baseUrl: string
  apiKey: string
  model: string
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
  return { baseUrl, apiKey, model }
}

/** Build an OpenAI-compatible LLM provider from environment variables. */
export function createLlmFromEnv(env?: Record<string, string | undefined>): OpenAiCompatibleProvider {
  const config = readLlmEnv(env)
  return new OpenAiCompatibleProvider({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model })
}
