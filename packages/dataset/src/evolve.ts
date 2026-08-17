import type { LlmProvider } from '@exharness/llm'
import { buildEvolutionPrompt } from './prompts.js'
import type { EvolutionMethod, EvolutionResult, GenerationOptions } from './types.js'

/** All five Evol-Instruct strategies, in a stable order. */
export const EVOLUTION_METHODS: readonly EvolutionMethod[] = [
  'add-constraint',
  'deepen',
  'concretize',
  'add-reasoning',
  'broaden',
]

/** Pick a random evolution strategy (WizardLM samples uniformly). */
export function randomEvolutionMethod(rng: () => number): EvolutionMethod {
  return EVOLUTION_METHODS[Math.floor(rng() * EVOLUTION_METHODS.length)]!
}

/**
 * Evolves a single instruction using an LLM: it builds the strategy-specific
 * prompt, calls the provider, and returns the trimmed rewrite. Callers apply
 * `isValidEvolution` to reject malformed rewrites.
 */
export class Evolver {
  private readonly llm: LlmProvider
  private readonly options: GenerationOptions

  constructor(llm: LlmProvider, options: GenerationOptions) {
    this.llm = llm
    this.options = options
  }

  async evolve(instruction: string, method: EvolutionMethod): Promise<EvolutionResult> {
    if (instruction.trim().length === 0) throw new Error('Evolver: instruction must be non-empty')
    const prompt = buildEvolutionPrompt(method, instruction)
    const result = await this.llm.generate({
      model: this.options.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
    })
    return { instruction: result.content.trim(), method }
  }
}
