import type { BenchmarkSample, ScoreResult, Scorer } from '../types.js'

const DEFAULT_LETTERS = ['A', 'B', 'C', 'D'] as const

function normalizeLetter(letter: string, letters: readonly string[]): string | null {
  const upper = letter.toUpperCase()
  return letters.includes(upper) ? upper : null
}

/**
 * Extract the multiple-choice letter from a model output, handling the common
 * formats seen in practice: "(A)", "A.", "A:", "A)", "A,", a bare letter, or
 * the full choice text. Mirrors the standard MMLU extraction used by HELM and
 * lm-evaluation-harness.
 */
export function extractChoiceLetter(
  output: string,
  options: { letters?: readonly string[]; choices?: readonly string[] } = {},
): string | null {
  const letters = options.letters ?? DEFAULT_LETTERS
  const text = output.trim()
  if (text.length === 0) return null

  const paren = /^\(([A-Za-z])\)/.exec(text)
  if (paren !== null) {
    const letter = normalizeLetter(paren[1]!, letters)
    if (letter !== null) return letter
  }

  const prefix = /^([A-Za-z])[\s.:,)]/.exec(text)
  if (prefix !== null) {
    const letter = normalizeLetter(prefix[1]!, letters)
    if (letter !== null) return letter
  }

  if (/^[A-Za-z]$/.test(text)) {
    const letter = normalizeLetter(text, letters)
    if (letter !== null) return letter
  }

  if (options.choices !== undefined) {
    const lower = text.toLowerCase()
    for (let i = 0; i < options.choices.length; i++) {
      const choice = options.choices[i]!
      if (choice.length > 0 && lower.includes(choice.toLowerCase())) return letters[i] ?? null
    }
  }

  return null
}

export interface MultipleChoiceScorerOptions {
  /** The option letters, defaulting to A/B/C/D. */
  letters?: readonly string[]
  /** Metadata key holding the choices array, defaulting to "choices". */
  choicesKey?: string
}

/**
 * Scores a multiple-choice benchmark (MMLU, BigToM, …) by extracting the
 * option letter from the model output and comparing it to the reference letter.
 */
export class MultipleChoiceScorer implements Scorer {
  private readonly letters: readonly string[]
  private readonly choicesKey: string

  constructor(options: MultipleChoiceScorerOptions = {}) {
    this.letters = options.letters ?? DEFAULT_LETTERS
    this.choicesKey = options.choicesKey ?? 'choices'
  }

  score(sample: BenchmarkSample, output: string): ScoreResult {
    const choices = sample.metadata?.[this.choicesKey]
    const choiceArray = Array.isArray(choices) ? choices.map(String) : undefined
    const extracted = extractChoiceLetter(output, { letters: this.letters, choices: choiceArray })
    const correct = extracted !== null && extracted === sample.reference
    return {
      sampleId: sample.id,
      correct,
      score: correct ? 1 : 0,
      details: { extracted, expected: sample.reference },
    }
  }
}
