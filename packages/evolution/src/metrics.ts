export interface Observation {
  harnessId: string
  success: boolean
  latencyMs: number
  costUsd: number
}

export interface HarnessMetrics {
  harnessId: string
  trials: number
  successes: number
  successRate: number
  totalLatencyMs: number
  avgLatencyMs: number
  totalCostUsd: number
  avgCostUsd: number
}

interface Accumulator {
  trials: number
  successes: number
  latencyMs: number
  costUsd: number
}

/**
 * Accumulates per-harness runtime metrics (success rate, latency, cost) — the
 * feedback signal that drives the self-evolution loop.
 */
export class MetricsCollector {
  private map = new Map<string, Accumulator>()

  private acc(harnessId: string): Accumulator {
    let acc = this.map.get(harnessId)
    if (acc === undefined) {
      acc = { trials: 0, successes: 0, latencyMs: 0, costUsd: 0 }
      this.map.set(harnessId, acc)
    }
    return acc
  }

  observe(observation: Observation): void {
    const acc = this.acc(observation.harnessId)
    acc.trials++
    if (observation.success) acc.successes++
    acc.latencyMs += observation.latencyMs
    acc.costUsd += observation.costUsd
  }

  get(harnessId: string): HarnessMetrics {
    return this.snapshot(harnessId, this.acc(harnessId))
  }

  all(): HarnessMetrics[] {
    return [...this.map.entries()].map(([id, acc]) => this.snapshot(id, acc))
  }

  private snapshot(harnessId: string, acc: Accumulator): HarnessMetrics {
    return {
      harnessId,
      trials: acc.trials,
      successes: acc.successes,
      successRate: acc.trials === 0 ? 0 : acc.successes / acc.trials,
      totalLatencyMs: acc.latencyMs,
      avgLatencyMs: acc.trials === 0 ? 0 : acc.latencyMs / acc.trials,
      totalCostUsd: acc.costUsd,
      avgCostUsd: acc.trials === 0 ? 0 : acc.costUsd / acc.trials,
    }
  }
}
