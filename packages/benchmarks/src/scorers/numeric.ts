import type { BenchmarkSample, ScoreResult, Scorer } from '../types.js'

/**
 * Extract the final number in a free-form answer, tolerating thousands
 * separators, decimals and a leading sign — the standard GSM8K answer-extraction
 * heuristic (the answer is conventionally the last number in the response).
 */
export function extractNumber(text: string): number | null {
  const matches = text.match(/-?\d[\d,]*\.?\d*/g)
  if (matches === null || matches.length === 0) return null
  const last = matches[matches.length - 1]!
  const value = Number.parseFloat(last.replace(/,/g, ''))
  return Number.isNaN(value) ? null : value
}

/** Compare two numbers within absolute and relative tolerance. */
export function numbersEqual(a: number, b: number, tolerance = 1e-6): boolean {
  if (a === b) return true
  const abs = Math.abs(a - b)
  if (abs <= tolerance) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return abs / scale <= tolerance
}

export interface NumericMatchScorerOptions {
  tolerance?: number
}

/**
 * Scores a numeric-answer benchmark (GSM8K, MATH, …) by extracting the final
 * number from both the reference and the model output and comparing them.
 */
export class NumericMatchScorer implements Scorer {
  private readonly tolerance: number

  constructor(options: NumericMatchScorerOptions = {}) {
    const tolerance = options.tolerance ?? 1e-6
    if (!(tolerance >= 0) || !Number.isFinite(tolerance))
      throw new Error('tolerance must be a finite non-negative number')
    this.tolerance = tolerance
  }

  score(sample: BenchmarkSample, output: string): ScoreResult {
    const expected = extractNumber(String(sample.reference))
    const predicted = extractNumber(output)
    const correct = expected !== null && predicted !== null && numbersEqual(predicted, expected, this.tolerance)
    return {
      sampleId: sample.id,
      correct,
      score: correct ? 1 : 0,
      details: { predicted, expected },
    }
  }
}
