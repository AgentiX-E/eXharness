import type { EvolutionMethod, SeedTask } from './types.js'

/**
 * Prompt templates for Self-Instruct (Wang et al. 2022) and Evol-Instruct
 * (Xu et al., WizardLM 2023). These are faithful reproductions of the
 * published prompts so that generated data matches the methodology of the
 * original works. The builders are pure functions — no LLM coupling — so the
 * exact prompt text is unit-testable.
 */

/**
 * The shared Evol-Instruct "Prompt Rewriter" preamble (WizardLM `depth.py`).
 * `{method}` is replaced by one of the four depth strategies below.
 */
export const BASE_DEPTH_PROMPT = `I want you act as a Prompt Rewriter.
Your objective is to rewrite a given prompt into a more complex version to make those famous AI systems (e.g., ChatGPT and GPT4) a bit harder to handle.
But the rewritten prompt must be reasonable and must be understood and responded by humans.
Your rewriting cannot omit the non-text parts such as the table and code in #The Given Prompt#:. Also, please do not omit the input in #The Given Prompt#.
You SHOULD complicate the given prompt using the following method:
{method}
You should try your best not to make the #Rewritten Prompt# become verbose, #Rewritten Prompt# can only add 10 to 20 words into #The Given Prompt#.
'#The Given Prompt#', '#Rewritten Prompt#', 'given prompt' and 'rewritten prompt' are not allowed to appear in #Rewritten Prompt#`

/** The four in-depth (deepening) strategies, keyed by evolution method. */
export const DEPTH_METHODS: Record<Exclude<EvolutionMethod, 'broaden'>, string> = {
  'add-constraint': 'Please add one more constraints/requirements into #The Given Prompt#',
  deepen:
    'If #The Given Prompt# contains inquiries about certain issues, the depth and breadth of the inquiry can be increased.',
  concretize: 'Please replace the general concepts with more specific concepts.',
  'add-reasoning':
    'If #The Given Prompt# can be solved with just a few simple thinking processes, you can rewrite it to explicitly request multiple-step reasoning.',
}

/** The in-breadth "Prompt Creator" preamble (WizardLM `breadth.py`). */
export const BREADTH_PROMPT = `I want you act as a Prompt Creator.
Your goal is to draw inspiration from the #Given Prompt# to create a brand new prompt.
This new prompt should belong to the same domain as the #Given Prompt# but be even more rare.
The LENGTH and complexity of the #Created Prompt# should be similar to that of the #Given Prompt#.
The #Created Prompt# must be reasonable and must be understood and responded by humans.
'#Given Prompt#', '#Created Prompt#', 'given prompt' and 'created prompt' are not allowed to appear in #Created Prompt#`

/**
 * Build the Evol-Instruct prompt for a given strategy and instruction.
 * Depth strategies use the "Prompt Rewriter" preamble; breadth uses the
 * "Prompt Creator" preamble.
 */
export function buildEvolutionPrompt(method: EvolutionMethod, instruction: string): string {
  if (method === 'broaden') {
    return `${BREADTH_PROMPT}\n#Given Prompt#: ${instruction}\n#Created Prompt#:`
  }
  const base = BASE_DEPTH_PROMPT.replace('{method}', DEPTH_METHODS[method])
  return `${base}\n#The Given Prompt#: ${instruction}\n#Rewritten Prompt#:`
}

/** Format a single seed task for the Self-Instruct generation prompt. */
export function formatSeedTask(seed: SeedTask, index: number): string {
  const lines = [`Task ${index}: ${seed.instruction}`]
  if (seed.input !== undefined && seed.input.length > 0) {
    lines.push(`Instance ${index}: ${seed.input} -> ${seed.output}`)
  } else {
    lines.push(`Instance ${index}: ${seed.output}`)
  }
  return lines.join('\n')
}

/**
 * Build the Self-Instruct instruction-generation prompt: it shows the seed
 * tasks as demonstrations and asks the model for `numToGenerate` new diverse
 * instructions (Wang et al. 2022, Section 3).
 */
export function buildSelfInstructPrompt(seedTasks: readonly SeedTask[], numToGenerate = 20): string {
  if (seedTasks.length === 0) throw new Error('buildSelfInstructPrompt: at least one seed task is required')
  if (!Number.isInteger(numToGenerate) || numToGenerate < 1) {
    throw new Error('buildSelfInstructPrompt: numToGenerate must be a positive integer')
  }
  const demonstrations = seedTasks.map((seed, i) => formatSeedTask(seed, i + 1)).join('\n')
  return `You are asked to come up with a set of ${numToGenerate} diverse task instructions. These task instructions will be given to a GPT model and we will evaluate the GPT model for completing the instructions.

Here are the requirements:
1. Try not to repeat the verb for each instruction to maximize diversity.
2. The language used for the instruction also should be diverse. For example, you should combine commands with questions.
3. The instructions should be in English.
4. A task instruction should be self-contained and clearly state what to do.

List of ${seedTasks.length} tasks:
${demonstrations}

List of ${numToGenerate} tasks:`
}
