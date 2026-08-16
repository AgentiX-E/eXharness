import type { LlmProvider } from '@exharness/llm'
import type { PairwiseResult, PairwiseWinner } from './types.js'

export interface PairwiseConfig {
  model?: string
}

/**
 * Build the pairwise-comparison prompt (MT-Bench judge style): two answers are
 * presented in fixed positions and the judge picks "A", "B" or "tie".
 */
export function buildPairwisePrompt(input: string, first: string, second: string): string {
  return [
    `You are a helpful assistant judge comparing two candidate answers.`,
    `[Question]: ${input}`,
    `[Answer A]: ${first}`,
    `[Answer B]: ${second}`,
    ``,
    `Which answer is better? Reply with ONLY one token: "A", "B", or "tie".`,
  ].join('\n')
}

/**
 * Parse a pairwise verdict. Accepts "A"/"B"/"tie", "Answer A/B", and mixed-case
 * forms; defaults to "tie" when no clear winner can be read.
 */
export function parsePairwiseResponse(raw: string): PairwiseWinner {
  const text = raw.trim().toLowerCase()
  if (text.includes('tie')) return 'tie'
  const mentionsA = /\b(answer\s+a|a)\b/.test(text)
  const mentionsB = /\b(answer\s+b|b)\b/.test(text)
  if (mentionsA && !mentionsB) return 'A'
  if (mentionsB && !mentionsA) return 'B'
  return 'tie'
}

/** Map a positional verdict from the reversed ordering back to original labels. */
function invert(verdict: PairwiseWinner): PairwiseWinner {
  if (verdict === 'A') return 'B'
  if (verdict === 'B') return 'A'
  return 'tie'
}

/**
 * A pairwise judge with **position-bias cancellation**: it evaluates the pair in
 * both orders (A,B) and (B,A). If the two orders agree on the *same* original
 * answer, that answer wins; if they disagree (i.e., each order favors whatever
 * sits in position "A"), position bias is flagged and the result is a tie.
 */
export class PairwiseJudge {
  constructor(
    private readonly llm: LlmProvider,
    private readonly config: PairwiseConfig = {},
  ) {}

  async compare(input: string, outputA: string, outputB: string): Promise<PairwiseResult> {
    const first = await this.runSingle(input, outputA, outputB)
    const second = invert(await this.runSingle(input, outputB, outputA))

    const consistent = first === second
    if (consistent) {
      return { winner: first, confidence: 1, positionBiasDetected: false }
    }
    return { winner: 'tie', confidence: 0, positionBiasDetected: true }
  }

  private async runSingle(input: string, first: string, second: string): Promise<PairwiseWinner> {
    const prompt = buildPairwisePrompt(input, first, second)
    const response = await this.llm.generate({
      model: this.config.model ?? 'default',
      messages: [{ role: 'user', content: prompt }],
    })
    return parsePairwiseResponse(response.content)
  }
}
