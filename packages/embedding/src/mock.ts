import { normalize } from './vector.js'
import type { EmbeddingProvider } from './types.js'

/** FNV-1a 32-bit hash — small, deterministic, no external dependency. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * A deterministic, offline embedding provider for tests and offline
 * development. Each `(text, dimension)` pair is hashed to a pseudo-random value
 * then the vector is L2-normalised, giving stable, distinct unit vectors.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'mock'
  readonly dimensions: number

  constructor(dimensions = 128) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('dimensions must be a positive integer')
    }
    this.dimensions = dimensions
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(this.dimensions)
      for (let d = 0; d < this.dimensions; d++) {
        const h = fnv1a(`${text}\u0000${d}`)
        vector[d] = (h / 0xffffffff) * 2 - 1
      }
      return normalize(vector)
    })
  }
}
