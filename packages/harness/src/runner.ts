import type { LlmMessage, LlmProvider } from '@exharness/llm'
import type {
  DeterministicSolver,
  FormatEnforcer,
  HarnessInput,
  HarnessOutput,
  HarnessStep,
  PromptTemplate,
  TaskRouter,
  Validator,
} from './types.js'

export interface HarnessConfig<T = unknown> {
  prompt: PromptTemplate
  validator: Validator<T>
  router?: TaskRouter
  solver?: DeterministicSolver<T>
  enforcer?: FormatEnforcer<T>
  /** Maximum LLM calls before giving up (format-enforcement retries). */
  maxAttempts?: number
  model?: string
  /** Sampling temperature forwarded to the LLM on every generation. */
  temperature?: number
}

/**
 * Executes the five-component Harness pipeline:
 *
 * 1. route the input,
 * 2. offload to the deterministic solver when possible (no LLM call),
 * 3. otherwise render the prompt and call the LLM,
 * 4. enforce the output format with retry-on-invalid,
 * 5. validate the final result.
 */
export class HarnessRunner<T = unknown> {
  constructor(private readonly config: HarnessConfig<T>) {}

  async run(llm: LlmProvider, input: HarnessInput): Promise<HarnessOutput<T>> {
    const trace: HarnessStep[] = []
    const route = this.config.router?.route(input) ?? 'default'
    trace.push({ name: 'route', detail: route })

    if (this.config.solver?.canSolve(input)) {
      trace.push({ name: 'solve', detail: 'deterministic offload' })
      const result = this.config.solver.solve(input)
      const validation = this.config.validator.validate(result)
      return {
        result,
        route,
        valid: validation.valid,
        validationErrors: validation.errors,
        attempts: 1,
        usedSolver: true,
        trace,
      }
    }

    const maxAttempts = this.config.maxAttempts ?? 3
    const basePrompt = this.config.prompt.render({ task: input.task, route, ...input.context })
    let content = basePrompt
    let result: T | undefined
    let attempts = 0
    let lastError = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt
      const messages: LlmMessage[] = [{ role: 'user', content }]
      const llmResult = await llm.generate({
        model: this.config.model ?? 'default',
        messages,
        jsonMode: this.config.enforcer !== undefined,
        temperature: this.config.temperature,
      })
      const raw = llmResult.content
      trace.push({ name: 'llm', detail: `attempt ${attempt}` })

      if (this.config.enforcer === undefined) {
        result = raw as unknown as T
        break
      }

      try {
        result = this.config.enforcer.parse(raw)
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        content = `${basePrompt}\n\nYour previous output was rejected: ${lastError}\nReturn a corrected answer.`
        trace.push({ name: 'retry', detail: lastError })
      }
    }

    if (result === undefined) {
      throw new Error(`harness failed after ${maxAttempts} attempt(s): ${lastError}`)
    }

    const validation = this.config.validator.validate(result)
    return {
      result,
      route,
      valid: validation.valid,
      validationErrors: validation.errors,
      attempts,
      usedSolver: false,
      trace,
    }
  }
}
