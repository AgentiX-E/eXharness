import { Sprt, type SprtDecision, type SprtState } from '@exharness/eval'
import { ThompsonRouter } from './thompson.js'

export interface CanaryConfig {
  baselineId: string
  candidateId: string
  /** Success rate under the null hypothesis (baseline, no improvement). */
  p0: number
  /** Success rate under the alternative hypothesis (candidate target). */
  p1: number
  alpha?: number
  beta?: number
  seed?: number
}

/**
 * A Canary controller that couples **Thompson-sampling traffic routing** with a
 * **Sequential Probability Ratio Test (SPRT)** decision.
 *
 * - `route()` returns which harness version should serve the next request,
 *   automatically favouring the better-performing arm as evidence accrues.
 * - `observe()` feeds the observed outcome back to both the router and (for
 *   candidate traffic) the SPRT.
 * - `decision()` reports whether to promote the candidate (`accept-alternative`),
 *   keep/roll back to the baseline (`accept-null`), or keep collecting data.
 */
export class CanaryController {
  readonly baselineId: string
  readonly candidateId: string

  private readonly router: ThompsonRouter
  private readonly sprt: Sprt

  constructor(config: CanaryConfig) {
    this.baselineId = config.baselineId
    this.candidateId = config.candidateId
    this.router = new ThompsonRouter({ seed: config.seed })
    this.router.addArm(this.baselineId)
    this.router.addArm(this.candidateId)
    this.sprt = new Sprt({
      alpha: config.alpha,
      beta: config.beta,
      p0: config.p0,
      p1: config.p1,
    })
  }

  route(): string {
    return this.router.select()
  }

  observe(arm: string, success: boolean): void {
    this.router.observe(arm, success)
    if (arm === this.candidateId) this.sprt.observe(success)
  }

  decision(): SprtDecision {
    return this.sprt.state.decision
  }

  get sprtState(): SprtState {
    return this.sprt.state
  }

  posterior(arm: string): { alpha: number; beta: number } {
    return this.router.posterior(arm)
  }
}
