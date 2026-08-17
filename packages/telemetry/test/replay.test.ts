import { describe, expect, it } from 'vitest'
import { replay } from '../src/index.js'
import type { TraceEvent } from '../src/index.js'

describe('replay', () => {
  it('rebuilds a trace from an append-only log', () => {
    const events: TraceEvent[] = [
      { type: 'span-start', traceId: 't1', spanId: 's1', name: 'agent', kind: 'agent', startTime: 10 },
      { type: 'span-start', traceId: 't1', spanId: 's2', parentSpanId: 's1', name: 'llm', kind: 'llm', startTime: 20 },
      { type: 'attribute', spanId: 's2', key: 'gen_ai.request.model', value: 'gpt-4' },
      { type: 'event', spanId: 's2', event: { name: 'prompt.sent', timestamp: 25 } },
      { type: 'span-end', spanId: 's2', endTime: 30, status: { code: 'ok' } },
      { type: 'span-end', spanId: 's1', endTime: 40 },
    ]
    const trace = replay(events)
    expect(trace.traceId).toBe('t1')
    expect(trace.spans).toHaveLength(2)
    expect(trace.spans[0]!.spanId).toBe('s1')
    expect(trace.spans[1]!.spanId).toBe('s2')
    expect(trace.spans[1]!.parentSpanId).toBe('s1')
    expect(trace.spans[1]!.attributes['gen_ai.request.model']).toBe('gpt-4')
    expect(trace.spans[1]!.events).toEqual([{ name: 'prompt.sent', timestamp: 25 }])
    expect(trace.spans[1]!.endTime).toBe(30)
    expect(trace.spans[1]!.status).toEqual({ code: 'ok' })
  })

  it('throws on events referencing an unknown span id', () => {
    expect(() => replay([{ type: 'span-end', spanId: 'missing', endTime: 1 }])).toThrow(/unknown span id/)
    expect(() => replay([{ type: 'attribute', spanId: 'missing', key: 'k', value: 'v' }])).toThrow(/unknown span id/)
    expect(() => replay([{ type: 'event', spanId: 'missing', event: { name: 'e', timestamp: 1 } }])).toThrow(
      /unknown span id/,
    )
  })

  it('throws on an empty log', () => {
    expect(() => replay([])).toThrow(/no span-start/)
  })
})
