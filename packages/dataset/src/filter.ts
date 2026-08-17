/**
 * Deterministic filters for synthetic instructions: blank/failure detection,
 * exact deduplication, and length/keyword quality gates. These are the
 * "post-generation" steps shared by Self-Instruct and Evol-Instruct.
 */

/** Placeholders the Evol-Instruct prompt forbids in any valid rewrite. */
const FORBIDDEN_PLACEHOLDERS = [
  '#Given Prompt#',
  '#Rewritten Prompt#',
  '#Created Prompt#',
  'given prompt',
  'rewritten prompt',
  'created prompt',
] as const

export interface InstructionFilterOptions {
  /** Minimum character length (inclusive). */
  minLength?: number
  /** Maximum character length (inclusive). */
  maxLength?: number
  /** Minimum whitespace-separated word count (inclusive). */
  minWords?: number
  /** Maximum whitespace-separated word count (inclusive). */
  maxWords?: number
  /** Forbidden substrings (case-insensitive). */
  forbiddenKeywords?: readonly string[]
}

/** True when the text is empty or whitespace-only. */
export function isBlank(text: string): boolean {
  return text.trim().length === 0
}

/**
 * True when an Evol-Instruct rewrite is well-formed. A rewrite is rejected when
 * it is blank or still contains any of the placeholder tokens the prompt
 * forbids — both signal that the model failed to actually rewrite.
 */
export function isValidEvolution(output: string): boolean {
  if (isBlank(output)) return false
  const lower = output.toLowerCase()
  return !FORBIDDEN_PLACEHOLDERS.some((token) => lower.includes(token.toLowerCase()))
}

/** Remove exact duplicates (after trimming), preserving first-seen order. */
export function deduplicateStrings(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = item.trim()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

/** Count whitespace-separated words. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
}

/**
 * Apply length/keyword quality gates. Returns true when the instruction passes
 * every configured constraint (unset constraints are ignored).
 */
export function passesFilters(text: string, options: InstructionFilterOptions = {}): boolean {
  const trimmed = text.trim()
  if (options.minLength !== undefined && trimmed.length < options.minLength) return false
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) return false
  const words = countWords(trimmed)
  if (options.minWords !== undefined && words < options.minWords) return false
  if (options.maxWords !== undefined && words > options.maxWords) return false
  if (options.forbiddenKeywords !== undefined) {
    const lower = trimmed.toLowerCase()
    for (const keyword of options.forbiddenKeywords) {
      if (lower.includes(keyword.toLowerCase())) return false
    }
  }
  return true
}
