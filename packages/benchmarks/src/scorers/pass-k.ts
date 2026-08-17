import { lgamma } from '@exharness/eval'

/**
 * Natural log of the binomial coefficient C(n, k), computed via the log-gamma
 * function so it stays numerically stable even for large n (where a direct
 * factorial/product would overflow the double range).
 */
function logCombinations(n: number, k: number): number {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)
}

/**
 * Unbiased pass@k estimator (Chen et al., "Evaluating Large Language Models
 * Trained on Code", 2021):
 *
 *     pass@k = 1 − C(n−c, k) / C(n, k)
 *
 * where n is the number of generated samples and c the number that pass. The
 * estimator is 1 when fewer than k samples are incorrect (n − c < k).
 */
export function passAtK(n: number, c: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(c) || !Number.isInteger(k)) {
    throw new Error('passAtK: n, c and k must be integers')
  }
  if (n < 1) throw new Error('passAtK: n must be >= 1')
  if (c < 0 || c > n) throw new Error('passAtK: c must be in [0, n]')
  if (k < 1) throw new Error('passAtK: k must be >= 1')
  if (k > n) throw new Error('passAtK: k must be <= n')
  if (n - c < k) return 1
  return 1 - Math.exp(logCombinations(n - c, k) - logCombinations(n, k))
}

/** Compute pass@k from a per-sample correctness array. */
export function passAtKFromOutputs(correctness: readonly boolean[], k: number): number {
  const n = correctness.length
  const c = correctness.filter(Boolean).length
  return passAtK(n, c, k)
}
