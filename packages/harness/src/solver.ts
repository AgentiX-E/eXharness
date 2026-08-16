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
