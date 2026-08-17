/**
 * Core data model for synthetic instruction datasets. A generated example is
 * an (instruction, input, output) triple; the `input` is optional and omitted
 * when the instruction is self-contained.
 */
export interface InstructionData {
  instruction: string
  input?: string
  output: string
}

/** A seed task that bootstraps Self-Instruct. */
export interface SeedTask {
  /** Natural-language instruction, e.g. "Given a sentence, fix its grammar." */
  instruction: string
  /** A concrete example input, or empty when the task is self-contained. */
  input?: string
  /** The expected output for `input`. */
  output: string
}

/** The five Evol-Instruct rewriting strategies (WizardLM). */
export type EvolutionMethod = 'add-constraint' | 'deepen' | 'concretize' | 'add-reasoning' | 'broaden'

/** Result of evolving a single instruction. */
export interface EvolutionResult {
  /** The evolved (rewritten) instruction. */
  instruction: string
  /** Which strategy produced it. */
  method: EvolutionMethod
}

/** Options shared by the generation pipelines. */
export interface GenerationOptions {
  /** Model name passed to the LLM provider. */
  model: string
  /** Sampling temperature. */
  temperature?: number
  /** Maximum tokens per generation. */
  maxTokens?: number
}
