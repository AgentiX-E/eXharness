/**
 * Hyperband — the multi-armed budget scheduler (Li et al., JMLR 2018).
 *
 * Hyperband organizes configurations into brackets. Each bracket runs
 * SuccessiveHalving: evaluate `n` configurations on a small budget, keep the
 * top 1/η, multiply the budget by η, and repeat until the maximum budget is
 * reached. The brackets trade off exploration (many cheap configs) against
 * exploitation (few configs on the full budget).
 */

export interface HyperBandOptions {
  /** Minimum resource budget assigned to a configuration. */
  minBudget: number
  /** Maximum resource budget assigned to a configuration. */
  maxBudget: number
  /** Reduction factor η (how aggressively each round prunes). Must be > 1. */
  eta?: number
}

export interface Bracket {
  /** Bracket index (s_max = most explorative, 0 = most exploitative). */
  s: number
  /** Number of configurations to sample initially. */
  initialConfigs: number
  /** Budget assigned to each configuration in the first round. */
  initialBudget: number
}

export class HyperBand {
  readonly minBudget: number
  readonly maxBudget: number
  readonly eta: number
  /** Number of brackets minus one: ⌊log_η(maxBudget / minBudget)⌋. */
  readonly sMax: number

  constructor(options: HyperBandOptions) {
    const minBudget = options.minBudget
    const maxBudget = options.maxBudget
    const eta = options.eta ?? 3
    if (!(minBudget > 0) || !Number.isFinite(minBudget)) {
      throw new Error('minBudget must be a positive finite number')
    }
    if (!(maxBudget >= minBudget) || !Number.isFinite(maxBudget)) {
      throw new Error('maxBudget must be finite and >= minBudget')
    }
    if (!(eta > 1) || !Number.isFinite(eta)) throw new Error('eta must be > 1')
    this.minBudget = minBudget
    this.maxBudget = maxBudget
    this.eta = eta
    this.sMax = Math.floor(Math.log(maxBudget / minBudget) / Math.log(eta))
  }

  /** All brackets, ordered from the most explorative (s_max) to the most exploitative (0). */
  brackets(): Bracket[] {
    const result: Bracket[] = []
    for (let s = this.sMax; s >= 0; s--) result.push(this.bracket(s))
    return result
  }

  /** A single bracket by index s. */
  bracket(s: number): Bracket {
    if (!Number.isInteger(s) || s < 0 || s > this.sMax) {
      throw new Error(`bracket index must be an integer in [0, ${this.sMax}]`)
    }
    const n = Math.ceil(((this.sMax + 1) / (s + 1)) * this.eta ** s)
    const r = this.maxBudget * this.eta ** -s
    return { s, initialConfigs: n, initialBudget: r }
  }

  /**
   * The successive-halving budget sequence for bracket `s`, from the initial
   * budget up to and including `maxBudget`.
   */
  budgetSequence(s: number): number[] {
    this.bracket(s) // validate the index
    const sequence: number[] = []
    let budget = this.maxBudget * this.eta ** -s
    while (budget < this.maxBudget * (1 - 1e-12)) {
      sequence.push(budget)
      budget *= this.eta
    }
    sequence.push(this.maxBudget)
    return sequence
  }

  /** Number of successive-halving rounds in a bracket. */
  rounds(s: number): number {
    return this.budgetSequence(s).length
  }

  /** Number of configurations that survive a round: ⌊n / η⌋ (at least 1). */
  static topConfigs(n: number, eta: number): number {
    return Math.max(1, Math.floor(n / eta))
  }
}
