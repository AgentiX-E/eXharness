import { describe, expect, it } from 'vitest'
import {
  addVectors,
  cholesky,
  choleskyInvert,
  choleskySolve,
  dot,
  matAdd,
  matScale,
  matVec,
  mulberry32,
  norm,
  outer,
  sampleMultivariateNormal,
  scale,
  subtractVectors,
} from '../src/index.js'

function closeMatrix(a: number[][], b: number[][], tol = 1e-10): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[i]!.length; j++) {
      expect(a[i]![j]).toBeCloseTo(b[i]![j]!, 10, tol)
    }
  }
}

function transposeL(L: number[][]): number[][] {
  const n = L.length
  const T: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) T[i]![j] = L[j]![i]!
  }
  return T
}

function multiply(a: number[][], b: number[][]): number[][] {
  const n = a.length
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) out[i]![j] += a[i]![k]! * b[k]![j]!
    }
  }
  return out
}

describe('vector operations', () => {
  it('dot computes the inner product', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(dot([], [])).toBe(0)
  })

  it('dot rejects mismatched lengths', () => {
    expect(() => dot([1, 2], [1])).toThrow(/equal length/)
  })

  it('scale, add and subtract are element-wise', () => {
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6])
    expect(addVectors([1, 2], [3, 4])).toEqual([4, 6])
    expect(subtractVectors([1, 2], [3, 4])).toEqual([-2, -2])
  })

  it('add and subtract reject mismatched lengths', () => {
    expect(() => addVectors([1], [1, 2])).toThrow(/equal length/)
    expect(() => subtractVectors([1], [1, 2])).toThrow(/equal length/)
  })

  it('norm is the Euclidean length', () => {
    expect(norm([3, 4])).toBe(5)
    expect(norm([])).toBe(0)
  })
})

describe('matrix operations', () => {
  it('matVec multiplies a matrix by a vector', () => {
    expect(
      matVec(
        [
          [1, 2],
          [3, 4],
        ],
        [5, 6],
      ),
    ).toEqual([17, 39])
  })

  it('matVec rejects mismatched dimensions and empty matrices', () => {
    expect(() => matVec([], [1])).toThrow(/empty matrix/)
    expect(() => matVec([[1, 2]], [1])).toThrow(/width must equal/)
  })

  it('outer computes the outer product', () => {
    expect(outer([1, 2], [3, 4])).toEqual([
      [3, 4],
      [6, 8],
    ])
  })

  it('matAdd and matScale are element-wise', () => {
    expect(matAdd([[1], [2]], [[3], [4]])).toEqual([[4], [6]])
    expect(matScale([[1, 2]], 3)).toEqual([[3, 6]])
  })

  it('matAdd rejects mismatched shapes', () => {
    expect(() => matAdd([[1]], [[1, 2]])).toThrow(/equal shape/)
    expect(() => matAdd([[1]], [])).toThrow(/equal shape/)
  })
})

describe('cholesky', () => {
  it('factorizes a 2x2 positive-definite matrix', () => {
    const A = [
      [4, 2],
      [2, 3],
    ]
    const L = cholesky(A)
    expect(L[0]![0]).toBe(2)
    expect(L[0]![1]).toBe(0)
    expect(L[1]![0]).toBe(1)
    expect(L[1]![1]).toBeCloseTo(Math.sqrt(2))
    closeMatrix(multiply(L, transposeL(L)), A)
  })

  it('factorizes a 3x3 positive-definite matrix', () => {
    const A = [
      [4, 12, -16],
      [12, 37, -43],
      [-16, -43, 98],
    ]
    const L = cholesky(A)
    closeMatrix(multiply(L, transposeL(L)), A)
  })

  it('rejects a non-positive-definite matrix', () => {
    const A = [
      [1, 2],
      [2, 1],
    ]
    expect(() => cholesky(A)).toThrow(/not positive-definite/)
  })

  it('rejects non-square and empty matrices', () => {
    expect(() => cholesky([])).toThrow(/non-empty/)
    expect(() => cholesky([[1, 2]])).toThrow(/square/)
  })
})

describe('choleskySolve and choleskyInvert', () => {
  it('solves A x = b for a known solution', () => {
    const A = [
      [4, 2],
      [2, 3],
    ]
    const L = cholesky(A)
    const b = [10, 11] // A · [1, 3] = [4+6, 2+9] = [10, 11]
    const x = choleskySolve(L, b)
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(3)
  })

  it('rejects a mismatched right-hand side', () => {
    const L = cholesky([
      [4, 2],
      [2, 3],
    ])
    expect(() => choleskySolve(L, [1])).toThrow(/dimensions must match/)
  })

  it('inverts A such that A·A⁻¹ ≈ I', () => {
    const A = [
      [4, 12, -16],
      [12, 37, -43],
      [-16, -43, 98],
    ]
    const L = cholesky(A)
    const inverse = choleskyInvert(L)
    const identity = multiply(A, inverse)
    closeMatrix(identity, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
  })
})

describe('sampleMultivariateNormal', () => {
  it('recovers the mean and covariance from many samples', () => {
    const A = [
      [4, 1],
      [1, 2],
    ]
    const L = cholesky(A)
    const mean = [1, -2]
    const rng = mulberry32(123)
    const n = 20000
    const sum = [0, 0]
    const outerSum = [
      [0, 0],
      [0, 0],
    ]
    for (let i = 0; i < n; i++) {
      const s = sampleMultivariateNormal(rng, mean, L)
      sum[0] += s[0]!
      sum[1] += s[1]!
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          outerSum[a]![b] += (s[a]! - mean[a]!) * (s[b]! - mean[b]!)
        }
      }
    }
    expect(sum[0]! / n).toBeCloseTo(mean[0]!, 1)
    expect(sum[1]! / n).toBeCloseTo(mean[1]!, 1)
    // Sample covariance ≈ A (within Monte Carlo tolerance).
    expect(outerSum[0]![0]! / n).toBeCloseTo(A[0]![0]!, 0)
    expect(outerSum[0]![1]! / n).toBeCloseTo(A[0]![1]!, 0)
    expect(outerSum[1]![1]! / n).toBeCloseTo(A[1]![1]!, 0)
  })

  it('rejects mismatched mean and factor dimensions', () => {
    const L = cholesky([
      [4, 2],
      [2, 3],
    ])
    expect(() => sampleMultivariateNormal(mulberry32(1), [0], L)).toThrow(/dimensions must match/)
  })
})
