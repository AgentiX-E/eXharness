import type { LlmGenerateOptions, LlmProvider, LlmResult } from './types.js'

export interface MockProviderConfig {
  /** Deterministic responses returned in order (cycles when exhausted). */
  responses?: string[]
  /** When true, echo the last user message as the completion. */
  echo?: boolean
  /** Emitted usage for every call, useful for cost/monitoring tests. */
  usage?: { inputTokens: number; outputTokens: number }
}

/**
 * A deterministic in-process provider for tests and offline development. It
 * never touches the network, making test suites hermetic and reproducible.
 */
export class MockProvider implements LlmProvider {
  readonly kind = 'mock'

  private cursor = 0

  constructor(private readonly config: MockProviderConfig = {}) {}

  async generate(options: LlmGenerateOptions): Promise<LlmResult> {
    const responses = this.config.responses ?? []
    let content: string
    if (this.config.echo === true) {
      const last = [...options.messages].reverse().find((m) => m.role === 'user')
      content = last?.content ?? ''
    } else if (responses.length > 0) {
      content = responses[this.cursor % responses.length]!
      this.cursor++
    } else {
      content = ''
    }
    return {
      content,
      finishReason: 'stop',
      usage: this.config.usage,
    }
  }
}
