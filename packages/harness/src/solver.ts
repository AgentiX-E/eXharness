import { evaluateArithmetic } from './arithmetic.js'
import type { DeterministicSolver, HarnessInput } from './types.js'

/**
 * A deterministic solver that captures a named group from a regex matched
 * against the task text. Illustrates the "offload unstable reasoning into
 * deterministic code" principle: when the input is exactly computable, no LLM
 * call is made at all.
 */
export class RegexSolver implements DeterministicSolver<string> {
  constructor(
    private readonly pattern: RegExp,
    private readonly group: number | string = 1,
  ) {}

  canSolve(input: HarnessInput): boolean {
    this.pattern.lastIndex = 0
    return this.pattern.test(input.task)
  }

  solve(input: HarnessInput): string {
    this.pattern.lastIndex = 0
    const match = this.pattern.exec(input.task)
    const captured = match?.groups?.[this.group as string] ?? match?.[this.group as number]
    return captured ?? ''
  }
}

/**
 * A deterministic arithmetic solver: when a task embeds an arithmetic
 * expression (e.g. "What is 2 + 3?"), it is evaluated exactly in code and no
 * LLM call is made. This is the "deterministic code solver" that transfers
 * stable computation out of the model (arXiv:2608.12307).
 */
export class ArithmeticSolver implements DeterministicSolver<string> {
  constructor(
    /** Pattern extracting a "number operator number …" chain from the task. */
    private readonly pattern: RegExp = /(?:\d+(?:\.\d+)?\s*[+\-*/]\s*)+\d+(?:\.\d+)?/,
  ) {}

  canSolve(input: HarnessInput): boolean {
    const expression = this.extract(input.task)
    if (expression === null) return false
    try {
      evaluateArithmetic(expression)
      return true
    } catch {
      return false
    }
  }

  solve(input: HarnessInput): string {
    const expression = this.extract(input.task)
    if (expression === null) throw new Error('ArithmeticSolver: no arithmetic expression found')
    return String(evaluateArithmetic(expression))
  }

  private extract(task: string): string | null {
    this.pattern.lastIndex = 0
    const match = this.pattern.exec(task)
    if (match === null) return null
    // A capture group, when present, pinpoints the expression within the match.
    return (match[1] ?? match[0]).trim()
  }
}
