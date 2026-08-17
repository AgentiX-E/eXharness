import { MultipleChoiceScorer } from './scorers/multiple-choice.js'
import { InstructionFollowingScorer } from './scorers/instruction-following.js'
import { NumericMatchScorer } from './scorers/numeric.js'
import type { Benchmark, BenchmarkSample, Dataset } from './types.js'

/** Parse a JSONL string into an array of objects (throws on invalid JSON). */
export function parseJsonl(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch (cause) {
        throw new Error(`parseJsonl: invalid JSON on line ${index + 1}`, { cause })
      }
    })
}

function inMemoryDataset(name: string, samples: BenchmarkSample[]): Dataset {
  return { name, load: () => samples }
}

export interface MmluEntry {
  question: string
  choices: string[]
  answer: string
}

/** Build a multiple-choice benchmark (MMLU, BigToM, …). */
export function multipleChoiceBenchmark(
  name: string,
  entries: { question: string; choices: string[]; answer: string }[],
  letters?: readonly string[],
): Benchmark {
  const samples: BenchmarkSample[] = entries.map((entry, i) => ({
    id: `${name}-${i}`,
    input: entry.question,
    reference: entry.answer,
    metadata: { choices: entry.choices },
  }))
  return {
    name,
    dataset: inMemoryDataset(name, samples),
    scorer: new MultipleChoiceScorer({ letters }),
  }
}

export interface IfEvalEntry {
  prompt: string
  instruction_id_list: string[]
  kwargs: Record<string, unknown>[]
}

/** Build an IFEval instruction-following benchmark. */
export function ifevalBenchmark(name: string, entries: IfEvalEntry[]): Benchmark {
  const samples: BenchmarkSample[] = entries.map((entry, i) => ({
    id: `${name}-${i}`,
    input: entry.prompt,
    reference: null,
    metadata: { instruction_id_list: entry.instruction_id_list, kwargs: entry.kwargs },
  }))
  return {
    name,
    dataset: inMemoryDataset(name, samples),
    scorer: new InstructionFollowingScorer(),
  }
}

export interface Gsm8kEntry {
  question: string
  answer: string
}

/** Build a GSM8K-style numeric-answer benchmark. */
export function gsm8kBenchmark(name: string, entries: Gsm8kEntry[]): Benchmark {
  const samples: BenchmarkSample[] = entries.map((entry, i) => ({
    id: `${name}-${i}`,
    input: entry.question,
    reference: entry.answer,
  }))
  return {
    name,
    dataset: inMemoryDataset(name, samples),
    scorer: new NumericMatchScorer(),
  }
}
