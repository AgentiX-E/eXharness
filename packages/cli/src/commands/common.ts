import type { HfSource } from '@exharness/benchmarks'
import type { LlmProvider } from '@exharness/llm'
import type { CliDeps } from '../cli.js'

/** A small representative MMLU subject subset for reproducible smoke runs. */
const DEFAULT_MMLU_SUBJECTS = [
  'abstract_algebra',
  'college_mathematics',
  'elementary_mathematics',
  'high_school_mathematics',
  'professional_law',
]

/** Parse an optional positive-integer option, falling back when absent. */
export function parsePositiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${value}"`)
  }
  return parsed
}

/** Parse the number of comparison trials (a statistical test needs >= 2). */
export function parseTrials(value: string | undefined, fallback: number): number {
  const trials = parsePositiveInt(value, 'trials', fallback)
  if (trials < 2) throw new Error('trials must be an integer >= 2')
  return trials
}

/** Parse a comma-separated MMLU subject list, falling back to the default set. */
export function parseSubjects(value: string | undefined): string[] {
  if (value === undefined) return DEFAULT_MMLU_SUBJECTS
  const subjects = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (subjects.length === 0) throw new Error('--subjects must contain at least one non-empty subject')
  return subjects
}

/** Build an `HfSource` from CLI dependencies (fetch + HF_TOKEN). */
export function hfSource(deps: CliDeps): HfSource {
  return { fetch: deps.fetch, token: deps.env.HF_TOKEN }
}

/** A generator that turns a benchmark input into a model completion. */
export function makeGenerate(llm: LlmProvider, model: string): (input: string) => Promise<string> {
  return async (input) => {
    const completion = await llm.generate({ model, messages: [{ role: 'user', content: input }] })
    return completion.content
  }
}
