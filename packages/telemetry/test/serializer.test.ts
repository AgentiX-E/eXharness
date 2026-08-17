import { describe, expect, it } from 'vitest'
import { deserializeTrace, serializeTrace } from '../src/index.js'
import type { Trace } from '../src/index.js'

function sampleTrace(): Trace {
  return {
    traceId: 't1',
    spans: [
      {
        name: 'agent',
        kind: 'agent',
        traceId: 't1',
        spanId: 's1',
        startTime: 10,
        endTime: 40,
        attributes: {},
        events: [],
      },
      {
        name: 'llm',
        kind: 'llm',
        traceId: 't1',
        spanId: 's2',
        parentSpanId: 's1',
        startTime: 20,
        endTime: 30,
        attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.usage.input_tokens': 100 },
        events: [{ name: 'prompt.sent', timestamp: 25 }],
        status: { code: 'ok' },
      },
    ],
  }
}

describe('serializeTrace / deserializeTrace', () => {
  it('round-trips a trace without loss', () => {
    const trace = sampleTrace()
    expect(deserializeTrace(serializeTrace(trace))).toEqual(trace)
  })

  it('supports pretty-printed output', () => {
    const json = serializeTrace(sampleTrace(), true)
    expect(json).toContain('\n')
  })

  it('rejects invalid JSON and malformed objects', () => {
    expect(() => deserializeTrace('not json')).toThrow(/invalid JSON/)
    expect(() => deserializeTrace('42')).toThrow(/expected a JSON object/)
    expect(() => deserializeTrace('null')).toThrow(/expected a JSON object/)
    expect(() => deserializeTrace('{}')).toThrow(/missing string traceId/)
    expect(() => deserializeTrace('{"traceId":"t"}')).toThrow(/missing spans array/)
  })
})
