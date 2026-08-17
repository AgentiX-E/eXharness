import { std } from '@exharness/eval'
import { mulberry32, standardNormal, type Rng } from './rng.js'

/**
 * Tree-structured Parzen Estimator (TPE) — the Bayesian surrogate used by BOHB
 * (Bergstra et al. 2011; Falkner et al. 2018). Observations are split by a loss
 * quantile into "good" (low loss) and "bad" (high loss) sets; each set is
 * modelled by a kernel density estimator, and new candidates are sampled from
 * the good density and scored by the likelihood ratio l(x)/g(x), which is
 * equivalent to maximizing expected improvement.
 */

export interface FloatParam {
  type: 'float'
  name: string
  min: number
  max: number
  /** Sample log-uniformly (requires min > 0). */
  log?: boolean
}

export interface IntParam {
  type: 'int'
  name: string
  min: number
  max: number
  /** Sample log-uniformly over integers (requires min > 0). */
  log?: boolean
}

export interface CategoricalParam {
  type: 'categorical'
  name: string
  choices: readonly string[]
}

export type Param = FloatParam | IntParam | CategoricalParam

export type Config = Record<string, number | string>

export interface TpeObservation {
  config: Config
  /** Objective value; lower is better. */
  loss: number
}

export interface TpeOptions {
  /** Quantile separating good from bad observations (default 0.15). */
  quantile?: number
  /** Probability of returning a random config instead of model-based (default 1/3). */
  rho?: number
  /** Number of candidates sampled per suggestion (default 64). */
  nSamples?: number
  /** Factor by which the good KDE bandwidth is widened when sampling (default 3). */
  bandwidthFactor?: number
  seed?: number
}

interface ParzenEstimator {
  /** Sample one value from the (optionally bandwidth-widened) density. */
  sample(rng: Rng, bandwidthFactor: number): number | string
  /** Log density at a value (used for the l/g likelihood ratio). */
  logDensity(value: number | string): number
}

/** Log-sum-exp of a list of numbers, computed without underflow. */
function logSumExp(values: number[]): number {
  let max = -Infinity
  for (const v of values) if (v > max) max = v
  let sum = 0
  for (const v of values) sum += Math.exp(v - max)
  return max + Math.log(sum)
}

/**
 * One-dimensional Gaussian KDE over a numeric sample (working in a transformed
 * space, e.g. log space). Bandwidth follows Silverman's rule of thumb
 * h = 1.06·σ·n^(-1/5), the MSE-optimal Gaussian kernel bandwidth.
 */
class NumericalParzen implements ParzenEstimator {
  private readonly bandwidth: number

  constructor(
    private readonly samples: number[],
    private readonly transform: (x: number) => number,
    private readonly inverse: (y: number) => number,
    private readonly clamp: (x: number) => number,
  ) {
    const n = samples.length
    const sigma = std(samples)
    const h = 1.06 * sigma * Math.pow(n, -0.2)
    this.bandwidth = h > 0 ? h : 1e-3
  }

  sample(rng: Rng, bandwidthFactor: number): number {
    const center = this.samples[Math.floor(rng() * this.samples.length)]!
    const raw = center + this.bandwidth * bandwidthFactor * standardNormal(rng)
    return this.clamp(this.inverse(raw))
  }

  logDensity(value: number | string): number {
    const y = this.transform(value as number)
    const terms = this.samples.map((xi) => {
      const z = (y - xi) / this.bandwidth
      return -0.5 * z * z
    })
    return logSumExp(terms) - Math.log(this.samples.length) - Math.log(this.bandwidth) - 0.5 * Math.log(2 * Math.PI)
  }
}

/** Categorical KDE with Laplace (add-α) smoothing. */
class CategoricalParzen implements ParzenEstimator {
  constructor(
    private readonly choices: readonly string[],
    private readonly counts: ReadonlyMap<string, number>,
    private readonly total: number,
    private readonly alpha: number,
  ) {}

  sample(rng: Rng): string {
    const weights = this.choices.map((c) => (this.counts.get(c) ?? 0) + this.alpha)
    let total = 0
    for (const w of weights) total += w
    let r = rng() * total
    for (let i = 0; i < this.choices.length - 1; i++) {
      r -= weights[i]!
      if (r <= 0) return this.choices[i]!
    }
    // r > 0 after every choice but the last, so the final choice is the hit.
    return this.choices[this.choices.length - 1]!
  }

  logDensity(value: number | string): number {
    const count = this.counts.get(value as string) ?? 0
    return Math.log(count + this.alpha) - Math.log(this.total + this.alpha * this.choices.length)
  }
}

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min
  if (x > max) return max
  return x
}

function makeEstimator(param: Param, values: readonly (number | string)[]): ParzenEstimator {
  if (param.type === 'categorical') {
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v as string, (counts.get(v as string) ?? 0) + 1)
    return new CategoricalParzen(param.choices, counts, values.length, 1)
  }
  const numeric = values.map((v) => v as number)
  const log = param.log === true
  const transform = log ? Math.log : (x: number) => x
  const inverse = log ? Math.exp : (y: number) => y
  const finalize =
    param.type === 'int'
      ? (x: number) => Math.round(clamp(x, param.min, param.max))
      : (x: number) => clamp(x, param.min, param.max)
  const modeled = numeric.map(transform)
  return new NumericalParzen(modeled, transform, inverse, finalize)
}

function validateParams(params: readonly Param[]): void {
  const seen = new Set<string>()
  for (const p of params) {
    if (seen.has(p.name)) throw new Error(`duplicate parameter name "${p.name}"`)
    seen.add(p.name)
    if (p.type === 'categorical') {
      if (p.choices.length === 0) throw new Error(`parameter "${p.name}" has no choices`)
    } else {
      if (!(p.min < p.max) || !Number.isFinite(p.min) || !Number.isFinite(p.max)) {
        throw new Error(`parameter "${p.name}" must satisfy min < max`)
      }
      if (p.log === true && p.min <= 0) {
        throw new Error(`log-scale parameter "${p.name}" requires min > 0`)
      }
    }
  }
}

/** Sample a uniformly-random configuration from the parameter space. */
export function randomConfig(params: readonly Param[], rng: Rng): Config {
  const config: Config = {}
  for (const p of params) {
    if (p.type === 'categorical') {
      config[p.name] = p.choices[Math.floor(rng() * p.choices.length)]!
    } else if (p.log === true) {
      const lo = Math.log(p.min)
      const hi = Math.log(p.max)
      const raw = Math.exp(lo + rng() * (hi - lo))
      config[p.name] = p.type === 'int' ? Math.round(clamp(raw, p.min, p.max)) : clamp(raw, p.min, p.max)
    } else if (p.type === 'int') {
      config[p.name] = Math.floor(p.min + rng() * (p.max - p.min + 1))
    } else {
      config[p.name] = p.min + rng() * (p.max - p.min)
    }
  }
  return config
}

/**
 * TPE sampler: given the observations so far, suggest the next configuration.
 * Returns a random configuration until there are at least `d + 1` observations
 * (where d is the number of parameters), then switches to model-based sampling.
 */
export class TpeSampler {
  readonly params: Param[]
  private readonly rng: Rng
  private readonly quantile: number
  private readonly rho: number
  private readonly nSamples: number
  private readonly bandwidthFactor: number

  constructor(params: readonly Param[], options: TpeOptions = {}) {
    validateParams(params)
    if (params.length === 0) throw new Error('at least one parameter is required')
    this.params = [...params]
    const quantile = options.quantile ?? 0.15
    const rho = options.rho ?? 1 / 3
    const nSamples = options.nSamples ?? 64
    if (!(quantile > 0 && quantile < 1)) throw new Error('quantile must be in (0, 1)')
    if (!(rho >= 0 && rho <= 1)) throw new Error('rho must be in [0, 1]')
    if (!Number.isInteger(nSamples) || nSamples < 1) throw new Error('nSamples must be a positive integer')
    this.rng = mulberry32(options.seed ?? 0x7ee5)
    this.quantile = quantile
    this.rho = rho
    this.nSamples = nSamples
    this.bandwidthFactor = options.bandwidthFactor ?? 3
  }

  /** Sample a uniformly-random configuration. */
  random(): Config {
    return randomConfig(this.params, this.rng)
  }

  /** Suggest the next configuration given past (config, loss) observations. */
  suggest(observations: readonly TpeObservation[]): Config {
    const nMin = this.params.length + 1
    if (observations.length < nMin) return this.random()
    if (this.rng() < this.rho) return this.random()

    const sorted = [...observations].sort((a, b) => a.loss - b.loss)
    const n = sorted.length
    const nGood = Math.max(nMin, Math.floor(this.quantile * n))
    const good = sorted.slice(0, nGood)
    const bad = sorted.slice(nGood)
    // Both densities need enough samples for a stable KDE; otherwise fall back
    // to random exploration (mirrors BOHB's N_b,g = max(N_min, N_b - N_b,l)).
    if (bad.length < nMin) return this.random()

    const goodEstimators = this.params.map((p) =>
      makeEstimator(
        p,
        good.map((o) => o.config[p.name]!),
      ),
    )
    const badEstimators = this.params.map((p) =>
      makeEstimator(
        p,
        bad.map((o) => o.config[p.name]!),
      ),
    )

    let bestConfig: Config | undefined
    let bestRatio = -Infinity
    for (let i = 0; i < this.nSamples; i++) {
      const candidate: Config = {}
      let logL = 0
      let logG = 0
      for (let j = 0; j < this.params.length; j++) {
        const value = goodEstimators[j]!.sample(this.rng, this.bandwidthFactor)
        candidate[this.params[j]!.name] = value
        logL += goodEstimators[j]!.logDensity(value)
        logG += badEstimators[j]!.logDensity(value)
      }
      const ratio = logL - logG
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestConfig = candidate
      }
    }
    return bestConfig!
  }
}
