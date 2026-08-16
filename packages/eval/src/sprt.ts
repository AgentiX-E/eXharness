/**
 * Wald's Sequential Probability Ratio Test (SPRT) for Bernoulli outcomes.
 *
 * SPRT decides between two hypotheses with a *guaranteed* bound on both the
 * type-I error (α) and type-II error (β) while stopping as early as the data
 * allows — the statistically rigorous backbone of a Canary rollout decision.
 *
 * - H₀: the true success rate equals the baseline `p0` (candidate is no better).
 * - H₁: the true success rate equals the target `p1` (candidate is better).
 */

export interface SprtConfig {
  /** Type-I error: probability of wrongly accepting H₁ when H₀ is true. */
  alpha?: number
  /** Type-II error: probability of wrongly accepting H₀ when H₁ is true. */
  beta?: number
  /** Success rate under the null hypothesis (current baseline). */
  p0: number
  /** Success rate under the alternative hypothesis (target improvement). */
  p1: number
}

export type SprtDecision = 'accept-null' | 'accept-alternative' | 'continue'

export interface SprtState {
  successes: number
  failures: number
  logLikelihoodRatio: number
  decision: SprtDecision
}

function validateRate(p: number, name: string): void {
  if (p <= 0 || p >= 1) throw new Error(`${name} must be strictly between 0 and 1`)
}

/** Log-likelihood ratio of the data under H₁ vs H₀ for Bernoulli observations. */
export function logLikelihoodRatio(successes: number, failures: number, p0: number, p1: number): number {
  validateRate(p0, 'p0')
  validateRate(p1, 'p1')
  return successes * Math.log(p1 / p0) + failures * Math.log((1 - p1) / (1 - p0))
}

/** Decision thresholds log(A) and log(B) for Wald's SPRT. */
export function sprtThresholds(alpha: number, beta: number): { upper: number; lower: number } {
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be in (0, 1)')
  if (beta <= 0 || beta >= 1) throw new Error('beta must be in (0, 1)')
  return {
    upper: Math.log((1 - beta) / alpha),
    lower: Math.log(beta / (1 - alpha)),
  }
}

/**
 * An accumulating SPRT instance. Feed it successive Bernoulli outcomes and it
 * returns the current decision; once a terminal decision is reached it is
 * sticky (further observations do not change it).
 */
export class Sprt {
  readonly p0: number
  readonly p1: number
  readonly alpha: number
  readonly beta: number
  readonly upper: number
  readonly lower: number

  private successes = 0
  private failures = 0
  private lr = 0
  private verdict: SprtDecision = 'continue'

  constructor(config: SprtConfig) {
    validateRate(config.p0, 'p0')
    validateRate(config.p1, 'p1')
    this.p0 = config.p0
    this.p1 = config.p1
    this.alpha = config.alpha ?? 0.05
    this.beta = config.beta ?? 0.2
    const thresholds = sprtThresholds(this.alpha, this.beta)
    this.upper = thresholds.upper
    this.lower = thresholds.lower
  }

  observe(success: boolean): SprtDecision {
    if (this.verdict !== 'continue') return this.verdict
    if (success) this.successes++
    else this.failures++
    this.lr = logLikelihoodRatio(this.successes, this.failures, this.p0, this.p1)
    if (this.lr >= this.upper) this.verdict = 'accept-alternative'
    else if (this.lr <= this.lower) this.verdict = 'accept-null'
    return this.verdict
  }

  /** The current decision (sticky once a terminal decision is reached). */
  decision(): SprtDecision {
    return this.verdict
  }

  get state(): SprtState {
    return {
      successes: this.successes,
      failures: this.failures,
      logLikelihoodRatio: this.lr,
      decision: this.verdict,
    }
  }
}
