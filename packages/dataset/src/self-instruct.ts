import type { LlmProvider } from '@exharness/llm'
import { deduplicateStrings, passesFilters, type InstructionFilterOptions } from './filter.js'
import { buildSelfInstructPrompt } from './prompts.js'
import type { GenerationOptions, SeedTask } from './types.js'

/** Default number of seed demonstrations shown to the model (Wang et al. 2022). */
const DEFAULT_DEMONSTRATION_COUNT = 8

export interface SelfInstructOptions extends GenerationOptions {
  /** Random source for seed sampling (defaults to Math.random). */
  rng?: () => number
  /** Post-generation length/keyword filters. */
  filter?: InstructionFilterOptions
  /** Number of seed demonstrations (defaults to 8). */
  demonstrationCount?: number
}

/**
 * Parse the model's "List of N tasks" output into individual instructions.
 * Handles both `Task 1: …`-prefixed output and plain line-per-instruction
 * output.
 */
export function parseGeneratedInstructions(output: string): string[] {
  const trimmed = output.trim()
  if (trimmed.length === 0) return []
  if (/Task\s+\d+\s*[:.]/i.test(trimmed)) {
    return trimmed
      .split(/Task\s+\d+\s*[:.]\s*/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }
  return trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[.):]\s*/, '').trim())
    .filter((line) => line.length > 0)
}

/**
 * Self-Instruct instruction generation: sample seed tasks as demonstrations,
 * ask the LLM for a batch of new diverse instructions, then parse, deduplicate
 * and filter them. Successfully generated instructions are appended to the
 * task pool so later rounds can build on them (iterative bootstrapping).
 */
export class SelfInstructPipeline {
  private readonly llm: LlmProvider
  private readonly options: SelfInstructOptions
  private readonly pool: SeedTask[]

  constructor(llm: LlmProvider, seedTasks: readonly SeedTask[], options: SelfInstructOptions) {
    if (seedTasks.length === 0) throw new Error('SelfInstructPipeline: at least one seed task is required')
    this.llm = llm
    this.options = options
    this.pool = [...seedTasks]
  }

  /** Current number of tasks in the pool (seeds plus previously generated). */
  get poolSize(): number {
    return this.pool.length
  }

  /** Generate up to `numToGenerate` new instructions and return them. */
  async generateInstructions(numToGenerate = 20): Promise<string[]> {
    if (!Number.isInteger(numToGenerate) || numToGenerate < 1) {
      throw new Error('generateInstructions: numToGenerate must be a positive integer')
    }
    const demonstrations = this.sampleDemonstrations()
    const prompt = buildSelfInstructPrompt(demonstrations, numToGenerate)
    const result = await this.llm.generate({
      model: this.options.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
    })
    const parsed = parseGeneratedInstructions(result.content)
    const deduped = deduplicateStrings(parsed)
    const accepted = deduped.filter((instruction) => this.accept(instruction))
    for (const instruction of accepted) {
      this.pool.push({ instruction, output: '' })
    }
    return accepted
  }

  private accept(instruction: string): boolean {
    if (!passesFilters(instruction, this.options.filter)) return false
    return !this.pool.some((task) => task.instruction.trim() === instruction.trim())
  }

  private sampleDemonstrations(): SeedTask[] {
    const count = Math.min(this.options.demonstrationCount ?? DEFAULT_DEMONSTRATION_COUNT, this.pool.length)
    const rng = this.options.rng ?? Math.random
    // Partial Fisher–Yates shuffle of the first `count` indices. This always
    // terminates and yields `count` distinct tasks, unlike a rejection loop
    // which can spin forever on a degenerate (constant) random source.
    const indices = this.pool.map((_, i) => i)
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (indices.length - i))
      const tmp = indices[i]!
      indices[i] = indices[j]!
      indices[j] = tmp
    }
    return indices.slice(0, count).map((i) => this.pool[i]!)
  }
}
