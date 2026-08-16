import type { ZodType } from 'zod'
import type { FormatEnforcer } from './types.js'

/**
 * Schema-backed format enforcement. Tries to parse the model output as JSON
 * first (falling back to raw-string parsing for string schemas), then validates
 * against the Zod schema, throwing a descriptive error on failure.
 */
export class ZodEnforcer<T> implements FormatEnforcer<T> {
  readonly schema: ZodType<T>

  constructor(schema: ZodType<T>) {
    this.schema = schema
  }

  parse(raw: string): T {
    let candidate: unknown = raw
    const trimmed = raw.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        candidate = JSON.parse(trimmed)
      } catch {
        candidate = raw
      }
    }
    const result = this.schema.safeParse(candidate)
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
      throw new Error(`format enforcement failed: ${detail}`)
    }
    return result.data
  }
}
