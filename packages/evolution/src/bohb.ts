import { HyperBand, type Bracket } from './hyperband.js'
import { TpeSampler, type Config, type Param, type TpeObservation } from './tpe.js'

/**
 * BOHB — Bayesian Optimization with Hyperband (Falkner, Klein & Hutter, ICML
 * 2018). It replaces Hyperband's uniform-random configuration sampling with a
 * TPE model trained **per budget**, giving the strong anytime performance of
 * Hyperband together with the faster convergence of Bayesian optimization.
 *
 * The optimizer is driven by a synchronous `suggest`/`observe` loop:
 *
 *     let s = optimizer.suggest()
 *     while (s !== null) {
 *       const loss = evaluate(s.config, s.budget)
 *       optimizer.observe({ config: s.config, loss, budget: s.budget })
 *       s = optimizer.suggest()
 *     }
 */

export interface BohbOptions {
  params: Param[]
  minBudget: number
  maxBudget: number
  eta?: number
  /** TPE quantile separating good/bad observations. */
  quantile?: number
  /** Probability of sampling a random configuration. */
  rho?: number
  /** Number of candidates sampled per model suggestion. */
  nSamples?: number
  /** KDE bandwidth widening factor for exploration. */
  bandwidthFactor?: number
  seed?: number
}

export interface BohbSuggestion {
  config: Config
  budget: number
}

export interface BohbResult {
  config: Config
  loss: number
  budget: number
}

export class BohbOptimizer {
  private readonly hb: HyperBand
  private readonly tpe: TpeSampler
  private readonly brackets: Bracket[]

  private bracketIdx = 0
  private roundConfigs: Config[] = []
  private roundResults: BohbResult[] = []
  private roundBudget = 0
  private roundCursor = 0
  private finished = false

  private readonly observations: BohbResult[] = []
  private bestResult: BohbResult | null = null

  constructor(options: BohbOptions) {
    this.hb = new HyperBand({
      minBudget: options.minBudget,
      maxBudget: options.maxBudget,
      eta: options.eta,
    })
    this.tpe = new TpeSampler(options.params, {
      quantile: options.quantile,
      rho: options.rho,
      nSamples: options.nSamples,
      bandwidthFactor: options.bandwidthFactor,
      seed: options.seed,
    })
    this.brackets = this.hb.brackets()
  }

  /** Next (config, budget) to evaluate, or null when the optimization is complete. */
  suggest(): BohbSuggestion | null {
    if (this.finished) return null
    if (this.roundCursor >= this.roundConfigs.length) {
      this.advance()
      if (this.finished) return null
    }
    const config = this.roundConfigs[this.roundCursor]!
    this.roundCursor++
    return { config, budget: this.roundBudget }
  }

  /** Record the loss of a configuration evaluated with the given budget. */
  observe(result: BohbResult): void {
    if (!Number.isFinite(result.loss)) throw new Error('loss must be finite')
    this.roundResults.push(result)
    this.observations.push(result)
    if (this.bestResult === null || result.loss < this.bestResult.loss) this.bestResult = result
  }

  /** Best (lowest-loss) configuration observed so far, or null. */
  best(): { config: Config; loss: number; budget: number } | null {
    return this.bestResult
  }

  private advance(): void {
    if (this.roundConfigs.length === 0) {
      this.startBracket()
      return
    }
    // The current round has finished: keep the top 1/η configs and grow the
    // budget, or move on to the next bracket once the max budget is reached.
    const survivors = this.topSurvivors()
    if (this.roundBudget >= this.hb.maxBudget * (1 - 1e-12)) {
      this.bracketIdx++
      if (this.bracketIdx >= this.brackets.length) {
        this.finished = true
        return
      }
      this.startBracket()
    } else {
      this.roundConfigs = survivors
      this.roundBudget *= this.hb.eta
      this.roundResults = []
      this.roundCursor = 0
    }
  }

  private startBracket(): void {
    const bracket = this.brackets[this.bracketIdx]!
    const observations = this.observationsAt(bracket.initialBudget)
    this.roundConfigs = Array.from({ length: bracket.initialConfigs }, () => this.tpe.suggest(observations))
    this.roundBudget = bracket.initialBudget
    this.roundResults = []
    this.roundCursor = 0
  }

  private topSurvivors(): Config[] {
    const keep = HyperBand.topConfigs(this.roundConfigs.length, this.hb.eta)
    const sorted = [...this.roundResults].sort((a, b) => a.loss - b.loss)
    return sorted.slice(0, keep).map((r) => r.config)
  }

  private observationsAt(budget: number): TpeObservation[] {
    const tolerance = 1e-9 * Math.max(1, budget)
    return this.observations
      .filter((o) => Math.abs(o.budget - budget) <= tolerance)
      .map((o) => ({ config: o.config, loss: o.loss }))
  }
}
