import type { AttributeValue } from './types.js'

/**
 * OpenTelemetry GenAI semantic-convention attribute names. These match the
 * published convention (`gen_ai.*`) so traces can be exported to any
 * OTLP-compatible collector or dashboard.
 */
export const GEN_AI_ATTRIBUTES = {
  OPERATION_NAME: 'gen_ai.operation.name',
  PROVIDER_NAME: 'gen_ai.provider.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
  AGENT_NAME: 'gen_ai.agent.name',
  AGENT_DESCRIPTION: 'gen_ai.agent.description',
  CONVERSATION_ID: 'gen_ai.conversation.id',
} as const

/** OpenInference span-kind attribute (compatible with Arize Phoenix). */
export const OPENINFERENCE_SPAN_KIND = 'openinference.span.kind'

/** Well-known `gen_ai.operation.name` values. */
export const GEN_AI_OPERATIONS = {
  CHAT: 'chat',
  TEXT_COMPLETION: 'text_completion',
  EMBEDDINGS: 'embeddings',
  EXECUTE_TOOL: 'execute_tool',
  RETRIEVAL: 'retrieval',
  INVOKE_AGENT: 'invoke_agent',
  INVOKE_WORKFLOW: 'invoke_workflow',
} as const

export interface LlmSpanAttributeInput {
  providerName: string
  requestModel: string
  responseModel?: string
  inputTokens?: number
  outputTokens?: number
  temperature?: number
  maxTokens?: number
  finishReasons?: readonly string[]
}

/**
 * Build the `gen_ai.*` attribute set for an LLM span from explicit values.
 * Only present values are emitted, keeping the attribute map compact.
 */
export function buildLlmSpanAttributes(input: LlmSpanAttributeInput): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {
    [GEN_AI_ATTRIBUTES.PROVIDER_NAME]: input.providerName,
    [GEN_AI_ATTRIBUTES.REQUEST_MODEL]: input.requestModel,
  }
  if (input.responseModel !== undefined) attributes[GEN_AI_ATTRIBUTES.RESPONSE_MODEL] = input.responseModel
  if (input.inputTokens !== undefined) attributes[GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS] = input.inputTokens
  if (input.outputTokens !== undefined) attributes[GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS] = input.outputTokens
  if (input.temperature !== undefined) attributes[GEN_AI_ATTRIBUTES.REQUEST_TEMPERATURE] = input.temperature
  if (input.maxTokens !== undefined) attributes[GEN_AI_ATTRIBUTES.REQUEST_MAX_TOKENS] = input.maxTokens
  if (input.finishReasons !== undefined && input.finishReasons.length > 0) {
    attributes[GEN_AI_ATTRIBUTES.RESPONSE_FINISH_REASONS] = [...input.finishReasons]
  }
  return attributes
}
