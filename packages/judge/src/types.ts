/** A named evaluation criterion for G-Eval style scoring. */
export interface Criterion {
  name: string
  description: string
}

export interface GEvalConfig {
  criteria: Criterion[]
  /** Score scale upper bound; the lower bound is always 1. Default 5. */
  scale?: number
  /** When true, instruct the judge to reason step by step before scoring. */
  useChainOfThought?: boolean
  model?: string
}

export interface GEvalResult {
  /** Overall score in [1, scale]. */
  score: number
  /** Overall score normalized to [0, 1]. */
  normalizedScore: number
  rationale: string
  /** Per-criterion scores in [1, scale], keyed by criterion name. */
  criteriaScores: Record<string, number>
  raw?: unknown
}

export type PairwiseWinner = 'A' | 'B' | 'tie'

export interface PairwiseResult {
  winner: PairwiseWinner
  /**
   * Agreement between the two orderings used to cancel position bias:
   * 1 when they agree, 0 when they disagree (position bias detected).
   */
  confidence: number
  positionBiasDetected: boolean
}
