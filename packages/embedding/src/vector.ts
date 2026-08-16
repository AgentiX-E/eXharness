/**
 * Cosine similarity between two equal-length vectors. Returns 0 when either
 * vector has zero norm (the cosine is then undefined). Uses a single-pass
 * accumulation for dot products and squared norms.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Dot product of two equal-length vectors. */
export function dotProduct(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

/** Euclidean (L2) distance between two equal-length vectors. */
export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`)
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!
    sum += d * d
  }
  return Math.sqrt(sum)
}

/** L2 (Euclidean) norm of a vector. */
export function norm(a: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * a[i]!
  return Math.sqrt(sum)
}

/** Return a new unit-length vector; the zero vector is returned unchanged. */
export function normalize(a: readonly number[]): number[] {
  const n = norm(a)
  if (n === 0) return [...a]
  return a.map((x) => x / n)
}
