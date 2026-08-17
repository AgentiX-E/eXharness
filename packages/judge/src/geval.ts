import { z } from 'zod'
import type { LlmProvider } from '@exharness/llm'
import type { Criterion, GEvalConfig, GEvalResult } from './types.js'

const GEvalResponseSchema = z.object({
  score: z.number(),
  criteria: z.record(z.string(), z.number()),
  rationale: z.string(),
})

/**
 * Build the G-Eval prompt (after Liu et al., 2023): criteria, a 1..scale range,
 * the input/output pair, and a strict JSON-only output contract.
 */
export function buildGEvalPrompt(
  criteria: readonly Criterion[],
  scale: number,
  input: string,
  output: string,
  useChainOfThought: boolean,
): string {
  const criteriaText = criteria.map((c, i) => `${i + 1}. ${c.name}: ${c.description}`).join('\n')
  const lines = [
    `You are evaluating the quality of an AI assistant's output against a set of criteria.`,
    ``,
    `Evaluation criteria (score each from 1 to ${scale}, where ${scale} is best):`,
    criteriaText,
    ``,
    `[Input]: ${input}`,
    `[Output]: ${output}`,
    ``,
  ]
  if (useChainOfThought) {
    lines.push(`Reason step by step about each criterion before assigning a score.`)
  }
  lines.push(
    `Return ONLY a JSON object with this exact shape (no markdown fences, no extra text):`,
    `{"score": <overall 1-${scale}>, "criteria": {"<criterion name>": <1-${scale}>, ...}, "rationale": "<brief justification>"}`,
  )
  return lines.join('\n')
}

interface ParsedGEval {
  score: number
  rationale: string
  criteriaScores: Record<string, number>
}

/**
 * Parse and validate a raw G-Eval response. Throws descriptive errors on
 * malformed JSON, missing fields, or out-of-range scores.
 */
export function parseGEvalResponse(raw: string, criteria: readonly Criterion[], scale: number): ParsedGEval {
  let data: unknown
  const trimmed = raw.trim()
  try {
    data = JSON.parse(trimmed)
  } catch {
    throw new Error(`GEval response is not valid JSON: ${trimmed.slice(0, 120)}`)
  }
  const result = GEvalResponseSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`GEval response schema invalid: ${result.error.issues.map((i) => i.message).join('; ')}`)
  }
  const { score, criteria: criteriaScores, rationale } = result.data
  if (score < 1 || score > scale) {
    throw new Error(`GEval overall score ${score} out of range [1, ${scale}]`)
  }
  for (const c of criteria) {
    const value = criteriaScores[c.name]
    if (typeof value !== 'number') {
      throw new Error(`GEval response missing criterion "${c.name}"`)
    }
    if (value < 1 || value > scale) {
      throw new Error(`GEval criterion "${c.name}" score ${value} out of range [1, ${scale}]`)
    }
  }
  return { score, rationale, criteriaScores }
}

/**
 * A G-Eval scorer: asks an LLM to rate an output against a rubric, enforces a
 * structured JSON contract via Zod, and returns a normalized score.
 */
export class GEvalJudge {
  readonly scale: number

  constructor(
    private readonly llm: LlmProvider,
    private readonly config: GEvalConfig,
  ) {
    if (config.criteria.length === 0) throw new Error('GEvalJudge requires at least one criterion')
    this.scale = config.scale ?? 5
    if (this.scale < 2) throw new Error('GEval scale must be >= 2')
  }

  async evaluate(input: string, output: string): Promise<GEvalResult> {
    const prompt = buildGEvalPrompt(
      this.config.criteria,
      this.scale,
      input,
      output,
      this.config.useChainOfThought === true,
    )
    const response = await this.llm.generate({
      model: this.config.model ?? 'default',
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
    })
    const parsed = parseGEvalResponse(response.content, this.config.criteria, this.scale)
    return {
      score: parsed.score,
      normalizedScore: (parsed.score - 1) / (this.scale - 1),
      rationale: parsed.rationale,
      criteriaScores: parsed.criteriaScores,
      raw: response.raw,
    }
  }
}
