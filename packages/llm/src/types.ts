/** The roles a chat message may take. */
export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmMessage {
  role: LlmRole
  content: string
  name?: string
}

export interface LlmTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface LlmToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LlmGenerateOptions {
  model: string
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  stop?: string[]
  tools?: LlmTool[]
  /** Force structured JSON output when the backend supports it. */
  jsonMode?: boolean
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
}

export interface LlmResult {
  content: string
  toolCalls?: LlmToolCall[]
  finishReason?: string
  usage?: LlmUsage
  /** The raw provider response, for advanced consumers and tracing. */
  raw?: unknown
}

/**
 * The pluggable LLM contract. Providers are **embedded** (in-process) — they
 * may call a remote model over HTTP, but they expose no own service/process
 * and can be swapped freely behind this interface.
 */
export interface LlmProvider {
  readonly kind: string
  generate(options: LlmGenerateOptions): Promise<LlmResult>
}
