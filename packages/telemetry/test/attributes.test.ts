import { describe, expect, it } from 'vitest'
import { GEN_AI_ATTRIBUTES, GEN_AI_OPERATIONS, OPENINFERENCE_SPAN_KIND, buildLlmSpanAttributes } from '../src/index.js'

describe('GEN_AI_ATTRIBUTES', () => {
  it('uses the published gen_ai.* attribute names', () => {
    expect(GEN_AI_ATTRIBUTES.OPERATION_NAME).toBe('gen_ai.operation.name')
    expect(GEN_AI_ATTRIBUTES.PROVIDER_NAME).toBe('gen_ai.provider.name')
    expect(GEN_AI_ATTRIBUTES.REQUEST_MODEL).toBe('gen_ai.request.model')
    expect(GEN_AI_ATTRIBUTES.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens')
    expect(GEN_AI_ATTRIBUTES.USAGE_OUTPUT_TOKENS).toBe('gen_ai.usage.output_tokens')
  })

  it('exposes the OpenInference span kind attribute', () => {
    expect(OPENINFERENCE_SPAN_KIND).toBe('openinference.span.kind')
  })

  it('lists well-known operation names', () => {
    expect(GEN_AI_OPERATIONS.CHAT).toBe('chat')
    expect(GEN_AI_OPERATIONS.EMBEDDINGS).toBe('embeddings')
    expect(GEN_AI_OPERATIONS.INVOKE_AGENT).toBe('invoke_agent')
  })
})

describe('buildLlmSpanAttributes', () => {
  it('always includes provider and request model', () => {
    expect(buildLlmSpanAttributes({ providerName: 'openai', requestModel: 'gpt-4' })).toEqual({
      'gen_ai.provider.name': 'openai',
      'gen_ai.request.model': 'gpt-4',
    })
  })

  it('includes optional fields only when present', () => {
    const attributes = buildLlmSpanAttributes({
      providerName: 'deepseek',
      requestModel: 'deepseek-chat',
      responseModel: 'deepseek-chat',
      inputTokens: 100,
      outputTokens: 50,
      temperature: 0.7,
      maxTokens: 2048,
      finishReasons: ['stop'],
    })
    expect(attributes['gen_ai.response.model']).toBe('deepseek-chat')
    expect(attributes['gen_ai.usage.input_tokens']).toBe(100)
    expect(attributes['gen_ai.usage.output_tokens']).toBe(50)
    expect(attributes['gen_ai.request.temperature']).toBe(0.7)
    expect(attributes['gen_ai.request.max_tokens']).toBe(2048)
    expect(attributes['gen_ai.response.finish_reasons']).toEqual(['stop'])
  })

  it('omits an empty finish-reasons array', () => {
    const attributes = buildLlmSpanAttributes({ providerName: 'openai', requestModel: 'gpt-4', finishReasons: [] })
    expect(attributes).not.toHaveProperty('gen_ai.response.finish_reasons')
  })
})
