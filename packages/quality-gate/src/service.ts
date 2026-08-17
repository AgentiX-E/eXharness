import type { Disposable } from '@exharness/core'
import { aggregateReport, type GateContext, type GateReport, type GateRunner } from './types.js'

/**
 * Aggregates a set of gate runners into a single quality gate. Runners can be
 * added and removed at runtime, so checks are hot-mountable — a runner that is
 * removed stops contributing to subsequent reports.
 */
export class QualityGateService {
  private runners = new Map<string, GateRunner>()

  constructor(runners: readonly GateRunner[] = []) {
    for (const runner of runners) this.add(runner)
  }

  /** Register a runner; returns a disposer that removes it. */
  add(runner: GateRunner): Disposable {
    if (this.runners.has(runner.name)) throw new Error(`quality-gate: runner "${runner.name}" is already registered`)
    this.runners.set(runner.name, runner)
    let removed = false
    return async () => {
      if (removed) return
      removed = true
      this.runners.delete(runner.name)
    }
  }

  remove(name: string): boolean {
    return this.runners.delete(name)
  }

  has(name: string): boolean {
    return this.runners.has(name)
  }

  get runnerNames(): string[] {
    return [...this.runners.keys()]
  }

  /** Run every registered runner and aggregate their results. */
  async run(context: GateContext = {}): Promise<GateReport> {
    const checks = []
    for (const runner of this.runners.values()) {
      checks.push(await this.runOne(runner, context))
    }
    return aggregateReport(checks)
  }

  private async runOne(runner: GateRunner, context: GateContext) {
    try {
      return await runner.run(context)
    } catch (error) {
      return {
        name: runner.name,
        status: 'error' as const,
        summary: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
