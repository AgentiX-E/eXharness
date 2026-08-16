/**
 * Cohen's Kappa: inter-rater agreement corrected for chance.
 *
 * Given two raters' categorical labels over the same items, Kappa measures
 * how much they agree *beyond* what would be expected by random chance:
 *
 *   κ = (Po − Pe) / (1 − Pe)
 *
 * where Po is the observed agreement proportion and Pe is the expected
 * agreement proportion under the assumption that the two raters are
 * independent. κ = 1 means perfect agreement, κ = 0 means agreement no better
 * than chance, and negative values mean worse than chance.
 *
 * This is the standard metric for monitoring whether an LLM-as-judge remains
 * aligned with human (or another judge's) labels over time.
 */

export interface KappaResult {
  kappa: number
  observedAgreement: number
  expectedAgreement: number
  /** Number of observed items. */
  n: number
  /** Number of distinct categories. */
  categories: number
}

/**
 * Compute Cohen's (unweighted) Kappa from two parallel label arrays.
 *
 * @throws if the two arrays have different lengths or are empty.
 */
export function cohensKappa(raterA: readonly string[], raterB: readonly string[]): KappaResult {
  if (raterA.length !== raterB.length) {
    throw new Error(`cohensKappa: rater length mismatch (${raterA.length} vs ${raterB.length})`)
  }
  const n = raterA.length
  if (n === 0) throw new Error('cohensKappa: empty sample')

  // Build the confusion (co-occurrence) matrix over the union of categories.
  const matrix = new Map<string, Map<string, number>>()
  const categories = new Set<string>()
  for (let i = 0; i < n; i++) {
    const a = raterA[i]!
    const b = raterB[i]!
    categories.add(a)
    categories.add(b)
    let row = matrix.get(a)
    if (row === undefined) matrix.set(a, (row = new Map()))
    row.set(b, (row.get(b) ?? 0) + 1)
  }
  const cats = [...categories]

  // Observed agreement: sum of the diagonal (where both raters agree).
  let observed = 0
  for (const c of cats) observed += matrix.get(c)?.get(c) ?? 0
  const po = observed / n

  // Expected agreement: sum over categories of (row marginal * col marginal),
  // normalised by n² (independence assumption).
  let expected = 0
  for (const c of cats) {
    let rowSum = 0
    let colSum = 0
    for (const c2 of cats) {
      rowSum += matrix.get(c)?.get(c2) ?? 0
      colSum += matrix.get(c2)?.get(c) ?? 0
    }
    expected += rowSum * colSum
  }
  const pe = expected / (n * n)

  // Degenerate case: perfect expected agreement (single category). When both
  // raters always agree, Kappa is conventionally 1 rather than undefined.
  const denominator = 1 - pe
  const kappa = denominator === 0 ? 1 : (po - pe) / denominator

  return {
    kappa,
    observedAgreement: po,
    expectedAgreement: pe,
    n,
    categories: cats.length,
  }
}

/** Convenience form returning only the Kappa coefficient. */
export function kappa(raterA: readonly string[], raterB: readonly string[]): number {
  return cohensKappa(raterA, raterB).kappa
}
