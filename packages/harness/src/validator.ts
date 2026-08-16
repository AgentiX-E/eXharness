import type { ValidationResult, Validator } from './types.js'

export type Predicate<T> = (result: T) => boolean

/**
 * A pure-function validator: a predicate that must hold, plus an optional
 * scalar score (higher is better). Multiple predicates accumulate errors.
 */
export class PredicateValidator<T> implements Validator<T> {
  constructor(
    private readonly checks: ReadonlyArray<{ name: string; predicate: Predicate<T> }>,
    private readonly scoreFn?: (result: T) => number,
  ) {}

  validate(result: T): ValidationResult {
    const errors: string[] = []
    for (const check of this.checks) {
      let ok = false
      try {
        ok = check.predicate(result)
      } catch {
        ok = false
      }
      if (!ok) errors.push(check.name)
    }
    return {
      valid: errors.length === 0,
      errors,
      score: this.scoreFn === undefined ? undefined : this.scoreFn(result),
    }
  }
}
