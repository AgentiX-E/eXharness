import { passAtK } from './scorers/pass-k.js'
import type { CodeExecutor, CodeExecutionResult } from './code-executor.js'

/**
 * A HumanEval-style coding task (Chen et al., 2021): a function signature and
 * docstring (`prompt`), a unit-test harness (`test`) and the function name
 * under test (`entryPoint`).
 */
export interface HumanEvalSample {
  taskId: string
  prompt: string
  test: string
  entryPoint: string
}

export interface HumanEvalSampleResult {
  taskId: string
  passed: number
  total: number
  /** Completions whose generation threw and were therefore never executed. */
  failedGenerations: number
}

export interface HumanEvalResult {
  samples: HumanEvalSampleResult[]
  /** Total number of generated completions across all tasks. */
  totalN: number
  /** Total number of passing completions across all tasks. */
  totalC: number
  passAt1: number
  passAtK: number
  k: number
  /** Total completions whose generation threw across all tasks. */
  failedGenerations: number
}

/**
 * Assemble the complete runnable program: the prompt + completion define the
 * candidate function, then the test harness defines `check(candidate)` and a
 * final `check(entryPoint)` call runs the assertions (an uncaught assertion is
 * a failure, so a zero exit code means the candidate passed).
 */
export function buildHumanEvalCode(prompt: string, completion: string, test: string, entryPoint: string): string {
  return `${prompt}${completion}\n\n${test}\n\ncheck(${entryPoint})\n`
}

export interface EvaluateHumanEvalOptions {
  /** Number of completions generated per task (defaults to 1). */
  numSamples?: number
  /** pass@k target (defaults to 1). */
  k?: number
  /** Per-execution timeout forwarded to the executor. */
  timeoutMs?: number
}

/**
 * Evaluate a HumanEval-style benchmark with the unbiased pass@k estimator. For
 * every task it generates `numSamples` completions, executes each in the
 * provided executor and counts how many pass, then aggregates the global
 * (n, c) and computes pass@k = 1 − C(n−c, k) / C(n, k).
 */
export async function evaluateHumanEval(
  samples: readonly HumanEvalSample[],
  executor: CodeExecutor,
  generate: (prompt: string) => Promise<string>,
  options: EvaluateHumanEvalOptions = {},
): Promise<HumanEvalResult> {
  const numSamples = options.numSamples ?? 1
  const k = options.k ?? 1
  if (!Number.isInteger(numSamples) || numSamples < 1) {
    throw new Error('evaluateHumanEval: numSamples must be a positive integer')
  }
  if (!Number.isInteger(k) || k < 1) throw new Error('evaluateHumanEval: k must be a positive integer')
  if (k > numSamples) throw new Error('evaluateHumanEval: k must be <= numSamples')

  const perSample: HumanEvalSampleResult[] = []
  let totalN = 0
  let totalC = 0

  for (const sample of samples) {
    let passed = 0
    let failedGenerations = 0
    for (let i = 0; i < numSamples; i++) {
      let completion: string
      try {
        completion = await generate(sample.prompt)
      } catch {
        failedGenerations++
        continue
      }
      const code = buildHumanEvalCode(sample.prompt, completion, sample.test, sample.entryPoint)
      let result: CodeExecutionResult
      try {
        result = await executor.execute(
          code,
          options.timeoutMs === undefined ? undefined : { timeoutMs: options.timeoutMs },
        )
      } catch {
        failedGenerations++
        continue
      }
      if (result.exitCode === 0 && !result.timedOut) passed++
    }
    totalN += numSamples
    totalC += passed
    perSample.push({ taskId: sample.taskId, passed, total: numSamples, failedGenerations })
  }

  const totalFailedGenerations = perSample.reduce((sum, sample) => sum + sample.failedGenerations, 0)

  if (totalN === 0) {
    return {
      samples: perSample,
      totalN: 0,
      totalC: 0,
      passAt1: 0,
      passAtK: 0,
      k,
      failedGenerations: totalFailedGenerations,
    }
  }

  const passAt1 = passAtK(totalN, totalC, 1)
  const passAtKValue = k === 1 ? passAt1 : passAtK(totalN, totalC, k)
  return {
    samples: perSample,
    totalN,
    totalC,
    passAt1,
    passAtK: passAtKValue,
    k,
    failedGenerations: totalFailedGenerations,
  }
}
