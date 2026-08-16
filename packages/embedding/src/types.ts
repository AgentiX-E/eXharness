/**
 * The pluggable embedding contract. Providers turn text into fixed-width
 * float64 vectors; callers remain agnostic to the underlying model or service.
 */
export interface EmbeddingProvider {
  readonly kind: string
  /** Dimensionality of produced vectors, when known up front. */
  readonly dimensions?: number
  /** Embed one or more texts; the result order matches the input order. */
  embed(texts: string[]): Promise<number[][]>
}
