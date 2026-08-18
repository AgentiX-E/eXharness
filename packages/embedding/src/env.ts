import { OpenAiCompatibleEmbeddingProvider } from './openai.js'

/**
 * Environment variable names for the pluggable embedding factory. API keys are
 * read ONLY from the environment and never from code or committed config.
 */
export const EMBEDDING_ENV_KEYS = {
  baseUrl: 'EXHARNESS_EMBEDDING_BASE_URL',
  apiKey: 'EXHARNESS_EMBEDDING_API_KEY',
  model: 'EXHARNESS_EMBEDDING_MODEL',
} as const

export interface EmbeddingEnvConfig {
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
 * Read the embedding configuration from environment variables. The base URL
 * and model default to the Zhipu GLM (embedding-3) endpoint; the API key is
 * required and a missing/empty key is a hard error.
 */
export function readEmbeddingEnv(env: Record<string, string | undefined> = resolveEnv()): EmbeddingEnvConfig {
  const baseUrl = env[EMBEDDING_ENV_KEYS.baseUrl] ?? 'https://open.bigmodel.cn/api/paas/v4'
  const model = env[EMBEDDING_ENV_KEYS.model] ?? 'embedding-3'
  const apiKey = env[EMBEDDING_ENV_KEYS.apiKey]
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(`createEmbeddingFromEnv: ${EMBEDDING_ENV_KEYS.apiKey} is required`)
  }
  return { baseUrl, apiKey, model }
}

/** Build an OpenAI-compatible embedding provider from environment variables. */
export function createEmbeddingFromEnv(env?: Record<string, string | undefined>): OpenAiCompatibleEmbeddingProvider {
  const config = readEmbeddingEnv(env)
  return new OpenAiCompatibleEmbeddingProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  })
}
