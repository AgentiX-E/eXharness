export type { EmbeddingProvider } from './types.js'
export { cosineSimilarity, dotProduct, euclideanDistance, norm, normalize } from './vector.js'
export { OpenAiCompatibleEmbeddingProvider, type OpenAiCompatibleEmbeddingConfig } from './openai.js'
export { MockEmbeddingProvider } from './mock.js'
export {
  createEmbeddingFromEnv,
  readEmbeddingEnv,
  resolveEnv,
  EMBEDDING_ENV_KEYS,
  type EmbeddingEnvConfig,
} from './env.js'
