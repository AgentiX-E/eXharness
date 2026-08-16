import { beta, mulberry32, type Rng } from './rng.js'

interface Arm {
  id: string
  alpha: number
  beta: number
}

/**
 * Thompson sampling over Bernoulli arms (Beta–Binomial conjugate model).
 *
 * Each arm maintains a Beta(α, β) posterior over its success probability,
 * initialized to a uniform Beta(1, 1) prior. `select()` draws one sample from
 * each posterior and returns the arm with the largest draw — the statistically
 * optimal way to balance exploration and exploitation during a Canary.
 */
export class ThompsonRouter {
  private readonly rng: Rng
  private readonly priorAlpha: number
  private readonly priorBeta: number
  private arms = new Map<string, Arm>()

  constructor(options: { seed?: number; priorAlpha?: number; priorBeta?: number } = {}) {
    this.rng = mulberry32(options.seed ?? 0x5eed)
    this.priorAlpha = options.priorAlpha ?? 1
    this.priorBeta = options.priorBeta ?? 1
  }

  addArm(id: string): void {
    if (this.arms.has(id)) return
    this.arms.set(id, { id, alpha: this.priorAlpha, beta: this.priorBeta })
  }

  removeArm(id: string): void {
    this.arms.delete(id)
  }

  /** Sample each arm's posterior and return the best arm's id. */
  select(): string {
    let bestId: string | undefined
    let bestDraw = -Infinity
    for (const arm of this.arms.values()) {
      const draw = beta(this.rng, arm.alpha, arm.beta)
      if (draw > bestDraw) {
        bestDraw = draw
        bestId = arm.id
      }
    }
    if (bestId === undefined) throw new Error('ThompsonRouter has no arms')
    return bestId
  }

  /** Update the posterior of an arm after observing a Bernoulli outcome. */
  observe(id: string, success: boolean): void {
    const arm = this.arms.get(id)
    if (arm === undefined) throw new Error(`unknown arm "${id}"`)
    if (success) arm.alpha++
    else arm.beta++
  }

  /** Current posterior parameters (for inspection and persistence). */
  posterior(id: string): { alpha: number; beta: number } {
    const arm = this.arms.get(id)
    if (arm === undefined) throw new Error(`unknown arm "${id}"`)
    return { alpha: arm.alpha, beta: arm.beta }
  }
}
