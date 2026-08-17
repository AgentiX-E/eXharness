/** Outcome of a single gate check. */
export type GateStatus = 'passed' | 'failed' | 'error'

/** The result of one gate check. */
export interface GateCheckResult {
  name: string
  status: GateStatus
  /** Human-readable one-line summary. */
  summary: string
  /** Optional structured details (metrics, thresholds, issues). */
  details?: Record<string, unknown>
}

/** Context handed to every gate runner (e.g. the working directory). */
export interface GateContext {
  cwd?: string
  [key: string]: unknown
}

/** A single, named quality check. */
export interface GateRunner {
  readonly name: string
  run(context: GateContext): Promise<GateCheckResult>
}

/** Aggregated result of running every gate. */
export interface GateReport {
  /** True only when no check failed or errored. */
  passed: boolean
  checks: GateCheckResult[]
  passedCount: number
  failedCount: number
  errorCount: number
}

/** Aggregate per-check results into a report. */
export function aggregateReport(checks: readonly GateCheckResult[]): GateReport {
  let passedCount = 0
  let failedCount = 0
  let errorCount = 0
  for (const check of checks) {
    if (check.status === 'passed') passedCount++
    else if (check.status === 'failed') failedCount++
    else errorCount++
  }
  return {
    passed: failedCount === 0 && errorCount === 0,
    checks: [...checks],
    passedCount,
    failedCount,
    errorCount,
  }
}
