/**
 * Zero-dependency numerical linear algebra primitives used by the self-evolution
 * engine (linear contextual bandits) and other scientific-computing layers.
 *
 * Everything is implemented with double precision and the numerically stable
 * Cholesky factorization, which is exact (up to rounding) for symmetric
 * positive-definite matrices and never requires pivoting.
 */

/** Dot product of two equal-length vectors. */
export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('dot: vectors must have equal length')
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

/** Multiply a vector by a scalar. */
export function scale(v: readonly number[], s: number): number[] {
  return v.map((x) => x * s)
}

/** Element-wise vector addition. */
export function addVectors(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new Error('addVectors: vectors must have equal length')
  return a.map((x, i) => x + b[i]!)
}

/** Element-wise vector subtraction (a - b). */
export function subtractVectors(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new Error('subtractVectors: vectors must have equal length')
  return a.map((x, i) => x - b[i]!)
}

/** Euclidean (L2) norm. */
export function norm(v: readonly number[]): number {
  return Math.sqrt(dot(v, v))
}

/** Matrix-vector product A·x. */
export function matVec(A: readonly number[][], x: readonly number[]): number[] {
  const n = A.length
  if (n === 0) throw new Error('matVec: empty matrix')
  if (A[0]!.length !== x.length) throw new Error('matVec: matrix width must equal vector length')
  return A.map((row) => dot(row, x))
}

/** Outer product a·bᵀ (a is a column, b is a row). */
export function outer(a: readonly number[], b: readonly number[]): number[][] {
  return a.map((ai) => b.map((bj) => ai * bj))
}

/** Element-wise matrix addition. */
export function matAdd(A: readonly number[][], B: readonly number[][]): number[][] {
  const n = A.length
  if (n === 0 || B.length !== n) throw new Error('matAdd: matrices must have equal shape')
  return A.map((row, i) => {
    if (row.length !== B[i]!.length) throw new Error('matAdd: matrices must have equal shape')
    return row.map((v, j) => v + B[i]![j]!)
  })
}

/** Multiply every entry of a matrix by a scalar. */
export function matScale(A: readonly number[][], s: number): number[][] {
  return A.map((row) => row.map((v) => v * s))
}

function assertSquare(A: readonly number[][]): number {
  const n = A.length
  if (n === 0) throw new Error('matrix must be non-empty')
  for (const row of A) {
    if (row.length !== n) throw new Error('matrix must be square')
  }
  return n
}

/**
 * Cholesky factorization of a symmetric positive-definite matrix A into a
 * lower-triangular L such that A = L·Lᵀ. Throws if A is not positive-definite.
 */
export function cholesky(A: readonly number[][]): number[][] {
  const n = assertSquare(A)
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i]![j]!
      for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!
      if (i === j) {
        if (sum <= 0) throw new Error('cholesky: matrix is not positive-definite')
        L[i]![j] = Math.sqrt(sum)
      } else {
        L[i]![j] = sum / L[j]![j]!
      }
    }
  }
  return L
}

function forwardSubstitution(L: readonly number[][], b: readonly number[]): number[] {
  const n = L.length
  const y = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let sum = b[i]!
    for (let k = 0; k < i; k++) sum -= L[i]![k]! * y[k]!
    y[i] = sum / L[i]![i]!
  }
  return y
}

function backSubstitution(L: readonly number[][], y: readonly number[]): number[] {
  const n = L.length
  const x = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!
    for (let k = i + 1; k < n; k++) sum -= L[k]![i]! * x[k]!
    x[i] = sum / L[i]![i]!
  }
  return x
}

/** Solve A·x = b where L is the Cholesky factor of A (A = L·Lᵀ). */
export function choleskySolve(L: readonly number[][], b: readonly number[]): number[] {
  if (L.length !== b.length) throw new Error('choleskySolve: factor and vector dimensions must match')
  return backSubstitution(L, forwardSubstitution(L, b))
}

/** Invert A given its Cholesky factor L (A = L·Lᵀ), returning A⁻¹. */
export function choleskyInvert(L: readonly number[][]): number[][] {
  const n = L.length
  const inverse: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let col = 0; col < n; col++) {
    const e = new Array<number>(n).fill(0)
    e[col] = 1
    const x = choleskySolve(L, e)
    for (let row = 0; row < n; row++) inverse[row]![col] = x[row]!
  }
  return inverse
}

/** Standard normal via the Box–Muller transform (self-contained, zero-dependency). */
function standardNormal(rng: () => number): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Sample from a multivariate normal N(mean, Σ) where Σ = L·Lᵀ is given by its
 * Cholesky factor L. The sample is mean + L·ε for ε ~ N(0, I).
 */
export function sampleMultivariateNormal(
  rng: () => number,
  mean: readonly number[],
  choleskyL: readonly number[][],
): number[] {
  const n = mean.length
  if (choleskyL.length !== n) throw new Error('sampleMultivariateNormal: mean and factor dimensions must match')
  const eps = new Array<number>(n)
  for (let i = 0; i < n; i++) eps[i] = standardNormal(rng)
  const Leps = matVec(choleskyL, eps)
  return addVectors(mean, Leps)
}
