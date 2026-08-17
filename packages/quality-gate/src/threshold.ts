import type { GateCheckResult, GateRunner } from './types.js'

export type ThresholdDirection = 'gte' | 'lte'

export interface ThresholdCheck {
  name: string
  /** The measured value to test. */
  value: number
  /** The threshold to compare against. */
  threshold: number
  /** Comparison direction: pass when value >= threshold (default) or <= threshold. */
  direction?: ThresholdDirection
}

/**
 * A gate runner that passes a single numeric metric against a threshold (e.g.
 * "lines coverage >= 95%"). Deterministic and dependency-free.
 */
export class ThresholdGateRunner implements GateRunner {
  readonly name: string
  private readonly check: ThresholdCheck

  constructor(check: ThresholdCheck) {
    if (check.name.length === 0) throw new Error('ThresholdGateRunner: name must be non-empty')
    if (!Number.isFinite(check.value) || !Number.isFinite(check.threshold)) {
      throw new Error(`ThresholdGateRunner: value and threshold must be finite for "${check.name}"`)
    }
    this.name = check.name
    this.check = check
  }

  async run(): Promise<GateCheckResult> {
    const { value, threshold } = this.check
    const direction = this.check.direction ?? 'gte'
    const passed = direction === 'lte' ? value <= threshold : value >= threshold
    const op = direction === 'lte' ? '<=' : '>='
    return {
      name: this.name,
      status: passed ? 'passed' : 'failed',
      summary: passed ? `value ${value} ${op} ${threshold}` : `value ${value} does not satisfy ${op} ${threshold}`,
      details: { value, threshold, direction },
    }
  }
}
