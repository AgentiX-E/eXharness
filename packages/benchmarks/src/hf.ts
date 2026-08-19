import type { IfEvalEntry, Gsm8kEntry } from './datasets.js'
import type { HumanEvalSample } from './human-eval.js'

/**
 * HuggingFace datasets-server loaders. The datasets-server exposes a stable
 * REST API that returns dataset rows as JSON, so benchmark data can be pulled
 * in Node and browsers without the Python `datasets` library. Every loader is
 * fully deterministic and accepts an injectable `fetch` for testing.
 */

/** The minimal `Response` surface a loader needs (compatible with `fetch`). */
export interface HfFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

/** A `fetch`-shaped function, injectable for tests; defaults to `globalThis.fetch`. */
export type HfFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<HfFetchResponse>

export interface HfSource {
  /** datasets-server base URL (defaults to the public API). */
  baseUrl?: string
  /** Injectable fetch (defaults to `globalThis.fetch`). */
  fetch?: HfFetch
  /** Optional bearer token for gated datasets. */
  token?: string
}

const DEFAULT_BASE_URL = 'https://datasets-server.huggingface.co'

interface HfRowsBody {
  rows?: { row: Record<string, unknown> }[]
}

function defaultHfFetch(): HfFetch {
  return (url, init) => globalThis.fetch(url, init as RequestInit)
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
}

/**
 * Fetch a single page of rows from the datasets-server `rows` endpoint and
 * return the raw row objects in order.
 */
export async function fetchHfRows(
  source: HfSource,
  dataset: string,
  config: string,
  split: string,
  limit: number,
  offset = 0,
): Promise<Record<string, unknown>[]> {
  assertPositiveInteger(limit, 'limit')
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer')
  const baseUrl = source.baseUrl ?? DEFAULT_BASE_URL
  const fetch = source.fetch ?? defaultHfFetch()
  const params = new URLSearchParams({ dataset, config, split, offset: String(offset), length: String(limit) })
  const url = `${baseUrl}/rows?${params.toString()}`
  const headers: Record<string, string> = {}
  if (source.token !== undefined && source.token.length > 0) headers.Authorization = `Bearer ${source.token}`

  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`fetchHfRows: HTTP ${response.status} for ${url}`)
  const body = (await response.json()) as HfRowsBody
  return (body.rows ?? []).map((entry) => entry.row)
}

/** The option letters used by MMLU's ClassLabel answer indices. */
const MMLU_LETTERS = ['A', 'B', 'C', 'D'] as const

/** A single MMLU entry with the answer normalised to its option letter. */
export interface MmluHfEntry {
  question: string
  choices: string[]
  answer: string
}

/**
 * Load a subset of MMLU across the given subjects. Each subject is a separate
 * datasets-server config; the answer is stored as a ClassLabel index (0..3)
 * and is normalised here to its A/B/C/D letter to match `MultipleChoiceScorer`.
 */
export async function loadMmluFromHf(
  source: HfSource,
  subjects: readonly string[],
  limitPerSubject: number,
): Promise<MmluHfEntry[]> {
  if (subjects.length === 0) throw new Error('loadMmluFromHf: subjects must be non-empty')
  assertPositiveInteger(limitPerSubject, 'limitPerSubject')

  const entries: MmluHfEntry[] = []
  for (const subject of subjects) {
    const rows = await fetchHfRows(source, 'cais/mmlu', subject, 'test', limitPerSubject)
    for (const row of rows) {
      const question = row.question
      const choices = row.choices
      const answerIndex = row.answer
      if (typeof question !== 'string' || !Array.isArray(choices) || typeof answerIndex !== 'number') {
        throw new Error(`loadMmluFromHf: unexpected row shape for subject "${subject}"`)
      }
      const letter = MMLU_LETTERS[answerIndex]
      if (letter === undefined) {
        throw new Error(`loadMmluFromHf: answer index ${answerIndex} out of range for subject "${subject}"`)
      }
      entries.push({ question, choices: choices.map(String), answer: letter })
    }
  }
  return entries
}

/** Load a subset of the IFEval instruction-following dataset (train split). */
export async function loadIfEvalFromHf(source: HfSource, limit: number): Promise<IfEvalEntry[]> {
  assertPositiveInteger(limit, 'limit')
  const rows = await fetchHfRows(source, 'google/IFEval', 'default', 'train', limit)
  return rows.map((row, index) => {
    const prompt = row.prompt
    const instructionIdList = row.instruction_id_list
    const kwargs = row.kwargs
    if (typeof prompt !== 'string' || !Array.isArray(instructionIdList) || !Array.isArray(kwargs)) {
      throw new Error(`loadIfEvalFromHf: unexpected row shape at index ${index}`)
    }
    return {
      prompt,
      instruction_id_list: instructionIdList.map(String),
      kwargs: kwargs as Record<string, unknown>[],
    }
  })
}

/** Load a subset of the GSM8K numeric-reasoning dataset. */
export async function loadGsm8kFromHf(source: HfSource, limit: number, split = 'test'): Promise<Gsm8kEntry[]> {
  assertPositiveInteger(limit, 'limit')
  const rows = await fetchHfRows(source, 'openai/gsm8k', 'main', split, limit)
  return rows.map((row, index) => {
    const question = row.question
    const answer = row.answer
    if (typeof question !== 'string' || typeof answer !== 'string') {
      throw new Error(`loadGsm8kFromHf: unexpected row shape at index ${index}`)
    }
    return { question, answer }
  })
}

/** Load a subset of the HumanEval coding dataset. */
export async function loadHumanEvalFromHf(source: HfSource, limit: number): Promise<HumanEvalSample[]> {
  assertPositiveInteger(limit, 'limit')
  const rows = await fetchHfRows(source, 'openai/openai_humaneval', 'openai_humaneval', 'test', limit)
  return rows.map((row, index) => {
    const taskId = row.task_id
    const prompt = row.prompt
    const test = row.test
    const entryPoint = row.entry_point
    if (
      typeof taskId !== 'string' ||
      typeof prompt !== 'string' ||
      typeof test !== 'string' ||
      typeof entryPoint !== 'string'
    ) {
      throw new Error(`loadHumanEvalFromHf: unexpected row shape at index ${index}`)
    }
    return { taskId, prompt, test, entryPoint }
  })
}
