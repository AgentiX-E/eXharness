import { cholesky, choleskyInvert, choleskySolve, dot, matScale, sampleMultivariateNormal } from '@exharness/eval'
import { mulberry32, type Rng } from './rng.js'

/**
 * Linear contextual bandits for online candidate selection. Each arm maintains
 * a ridge-regression posterior over its reward model
 *
 *     θ̂_a = A_a⁻¹ b_a,  A_a = λI + Σ xₜ xₜᵀ,  b_a = Σ rₜ xₜ,
 *
 * where xₜ is the arm's context feature vector and rₜ the observed reward.
 * The two concrete strategies differ only in how they trade exploration
 * against exploitation:
 *
 *  - LinUCB adds a confidence-bonus term (Li et al., WWW 2010).
 *  - LinTS samples θ̃ from the posterior (Agrawal & Goyal, ICML 2013).
 */

interface ArmState {
  id: string
  /** λI + Σ x xᵀ (ridge design matrix). */
  A: number[][]
  /** Σ r·x (ridge response vector). */
  b: number[]
  /** Cached Cholesky factor of A, invalidated by `observe`. */
  L?: number[][]
  /** Cached inverse A⁻¹, invalidated by `observe`. */
  AInv?: number[][]
}

export interface LinearBanditOptions {
  /** Dimensionality of every arm's context feature vector. */
  featureDim: number
  /** Ridge regularization λ (must be > 0). */
  regularization?: number
  /** Seed for the internal PRNG (LinTS posterior sampling). */
  seed?: number
}

abstract class LinearBanditBase {
  protected readonly rng: Rng
  protected readonly featureDim: number
  protected readonly regularization: number
  private readonly arms = new Map<string, ArmState>()

  constructor(options: LinearBanditOptions) {
    if (!Number.isInteger(options.featureDim) || options.featureDim < 1) {
      throw new Error('featureDim must be a positive integer')
    }
    const lambda = options.regularization ?? 1
    if (!(lambda > 0) || !Number.isFinite(lambda)) {
      throw new Error('regularization must be a positive finite number')
    }
    this.rng = mulberry32(options.seed ?? 0xb4a017)
    this.featureDim = options.featureDim
    this.regularization = lambda
  }

  addArm(id: string): void {
    if (this.arms.has(id)) return
    const d = this.featureDim
    const A = Array.from({ length: d }, () => new Array<number>(d).fill(0))
    for (let i = 0; i < d; i++) A[i]![i] = this.regularization
    this.arms.set(id, { id, A, b: new Array<number>(d).fill(0) })
  }

  removeArm(id: string): void {
    this.arms.delete(id)
  }

  hasArm(id: string): boolean {
    return this.arms.has(id)
  }

  get armIds(): string[] {
    return [...this.arms.keys()]
  }

  /** Number of arms currently registered. */
  get armCount(): number {
    return this.arms.size
  }

  /** Current ridge estimate θ̂ = A⁻¹ b for an arm (for inspection). */
  thetaHat(id: string): number[] {
    const arm = this.require(id)
    return choleskySolve(this.factor(arm), arm.b)
  }

  /**
   * Select the arm with the highest score given every arm's current context.
   * `features` must contain an entry for every registered arm.
   */
  select(features: ReadonlyMap<string, readonly number[]>): string {
    if (this.arms.size === 0) throw new Error('linear bandit has no arms')
    let bestId: string | undefined
    let bestScore = -Infinity
    for (const arm of this.arms.values()) {
      const x = features.get(arm.id)
      if (x === undefined) throw new Error(`missing context features for arm "${arm.id}"`)
      this.assertDim(x)
      const score = this.score(arm, x)
      if (score > bestScore) {
        bestScore = score
        bestId = arm.id
      }
    }
    return bestId!
  }

  /** Update an arm's posterior after observing reward `r` for context `x`. */
  observe(id: string, feature: readonly number[], reward: number): void {
    const arm = this.require(id)
    this.assertDim(feature)
    if (!Number.isFinite(reward)) throw new Error('reward must be finite')
    for (let i = 0; i < this.featureDim; i++) {
      arm.b[i]! += reward * feature[i]!
      for (let j = 0; j < this.featureDim; j++) {
        arm.A[i]![j]! += feature[i]! * feature[j]!
      }
    }
    arm.L = undefined
    arm.AInv = undefined
  }

  /** Concrete strategy: score = f(x, posterior). */
  protected abstract score(arm: ArmState, x: readonly number[]): number

  protected require(id: string): ArmState {
    const arm = this.arms.get(id)
    if (arm === undefined) throw new Error(`unknown arm "${id}"`)
    return arm
  }

  protected factor(arm: ArmState): number[][] {
    let L = arm.L
    if (L === undefined) {
      L = cholesky(arm.A)
      arm.L = L
    }
    return L
  }

  protected inverse(arm: ArmState): number[][] {
    let AInv = arm.AInv
    if (AInv === undefined) {
      AInv = choleskyInvert(this.factor(arm))
      arm.AInv = AInv
    }
    return AInv
  }

  private assertDim(x: readonly number[]): void {
    if (x.length !== this.featureDim) {
      throw new Error(`feature vector must have length ${this.featureDim}, got ${x.length}`)
    }
  }
}

export interface LinUcbOptions extends LinearBanditOptions {
  /** Exploration bonus coefficient α (must be > 0). */
  alpha?: number
}

/**
 * LinUCB — select the arm maximizing xᵀθ̂ + α·√(xᵀA⁻¹x), where the second
 * term is an upper-confidence bound on the (uncertain) linear reward estimate.
 */
export class LinUcb extends LinearBanditBase {
  private readonly alpha: number

  constructor(options: LinUcbOptions) {
    super(options)
    const alpha = options.alpha ?? 1
    if (!(alpha > 0) || !Number.isFinite(alpha)) throw new Error('alpha must be a positive finite number')
    this.alpha = alpha
  }

  protected score(arm: ArmState, x: readonly number[]): number {
    const L = this.factor(arm)
    const theta = choleskySolve(L, arm.b)
    const z = choleskySolve(L, x) // z = A⁻¹ x
    const mean = dot(x, theta)
    const uncertainty = Math.sqrt(Math.max(0, dot(x, z)))
    return mean + this.alpha * uncertainty
  }
}

export interface LinTsOptions extends LinearBanditOptions {
  /** Posterior variance scale ν² (must be > 0). */
  explorationScale?: number
}

/**
 * LinTS — sample θ̃ ~ N(θ̂, ν²A⁻¹) from the arm's posterior and select the arm
 * maximizing xᵀθ̃. Posterior sampling naturally balances exploration and
 * exploitation via probability matching.
 */
export class LinTs extends LinearBanditBase {
  private readonly explorationScale: number

  constructor(options: LinTsOptions) {
    super(options)
    const scale = options.explorationScale ?? 1
    if (!(scale > 0) || !Number.isFinite(scale)) {
      throw new Error('explorationScale must be a positive finite number')
    }
    this.explorationScale = scale
  }

  protected score(arm: ArmState, x: readonly number[]): number {
    const L = this.factor(arm)
    const theta = choleskySolve(L, arm.b)
    const AInv = this.inverse(arm)
    // ν²A⁻¹ = (ν·L_inv)(ν·L_inv)ᵀ where L_inv is the Cholesky factor of A⁻¹.
    const LInv = cholesky(AInv)
    const scaled = matScale(LInv, Math.sqrt(this.explorationScale))
    const thetaTilde = sampleMultivariateNormal(this.rng, theta, scaled)
    return dot(x, thetaTilde)
  }
}
