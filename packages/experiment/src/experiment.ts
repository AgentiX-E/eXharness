import { Tracer } from '@exharness/telemetry'
import type { ExperimentResult, Objective, Optimizer } from './types.js'

export interface RunExperimentOptions {
  optimizer: Optimizer
  objective: Objective
  /** Optional tracer (a fresh one is created when omitted). */
  tracer?: Tracer
  /** Display name recorded in the result (defaults to the optimizer class name). */
  optimizerName?: string
  /** Optional persistence callback invoked once with the final result. */
  onResult?: (result: ExperimentResult) => Promise<void> | void
}

/**
 * Drive an optimizer over an objective until it declares completion. Every
 * evaluation is recorded as a traced span (budget + configuration as
 * attributes, loss as an attribute), so the whole self-evolution run is
 * auditable and replayable.
 */
export async function runExperiment(options: RunExperimentOptions): Promise<ExperimentResult> {
  const tracer = options.tracer ?? new Tracer()
  const name = options.optimizerName ?? options.optimizer.constructor.name
  const root = tracer.startSpan('experiment', 'internal', { optimizer: name })

  let suggestion = options.optimizer.suggest()
  let evaluations = 0
  while (suggestion !== null) {
    const span = tracer.startSpan('evaluate', 'internal', {
      budget: suggestion.budget,
      config: JSON.stringify(suggestion.config),
    })
    let loss: number
    try {
      loss = await options.objective.evaluate(suggestion.config, suggestion.budget)
    } catch (error) {
      tracer.endSpan(span, { code: 'error', message: error instanceof Error ? error.message : String(error) })
      throw error
    }
    tracer.setAttribute(span, 'loss', loss)
    tracer.endSpan(span)
    options.optimizer.observe({ config: suggestion.config, loss, budget: suggestion.budget })
    evaluations++
    suggestion = options.optimizer.suggest()
  }

  tracer.endSpan(root)
  const best = options.optimizer.best()

  const result: ExperimentResult = {
    optimizer: name,
    bestLoss: best?.loss ?? Number.POSITIVE_INFINITY,
    bestConfig: best?.config ?? {},
    evaluations,
    traceId: tracer.trace.traceId,
  }

  if (options.onResult !== undefined) await options.onResult(result)
  return result
}
