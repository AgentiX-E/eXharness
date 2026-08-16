import type { ZodType } from 'zod'

/**
 * The five components of a Harness (after arXiv:2608.12307, "strong-to-weak
 * capability transfer via harnesses"). Each is a pluggable, composable unit;
 * together they form a deterministic scaffold around an LLM that transfers
 * cognitive structure without changing model weights.
 */

/** 1. Prompt template: renders a task + variables into a model prompt. */
export interface PromptTemplate {
  render(variables: Record<string, unknown>): string
}

/** 2. Task router: maps an input to a named route/benchmark-specific handler. */
export interface TaskRouter {
  route(input: HarnessInput): string
}

/** 3. Deterministic code solver: offloads stable reasoning into code. */
export interface DeterministicSolver<T = unknown> {
  /** Whether this solver can handle the given input without an LLM. */
  canSolve(input: HarnessInput): boolean
  /** Solve the input deterministically. */
  solve(input: HarnessInput): T
}

/** 4. Format enforcer: validates/parses raw model output against a schema. */
export interface FormatEnforcer<T = unknown> {
  readonly schema: ZodType<T>
  /** Parse raw output; throws a descriptive error on failure. */
  parse(raw: string): T
}

/** 5. Validator: pure-function assertions on the final result. */
export interface Validator<T = unknown> {
  validate(result: T): ValidationResult
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  score?: number
}

export interface HarnessInput {
  task: string
  context?: Record<string, unknown>
}

export interface HarnessStep {
  name: string
  detail?: string
}

export interface HarnessOutput<T = unknown> {
  result: T
  route: string
  valid: boolean
  validationErrors: string[]
  attempts: number
  usedSolver: boolean
  trace: HarnessStep[]
}
