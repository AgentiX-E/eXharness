import { describe, expect, it } from 'vitest'
import { Tracer, generateId } from '../src/index.js'

describe('generateId', () => {
  it('returns a non-empty string and unique values', () => {
    const a = generateId()
    const b = generateId()
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })

  it('uses an injected randomUUID when provided', () => {
    expect(generateId(() => 'fixed-id')).toBe('fixed-id')
  })

  it('falls back to a timestamped id when randomUUID is unavailable', () => {
    expect(generateId(null)).toMatch(/^id-/)
    expect(generateId(undefined, {})).toMatch(/^id-/)
  })
})

describe('Tracer', () => {
  function clock() {
    let t = 0
    return () => (t += 10)
  }

  function ids() {
    let i = 0
    return () => `span-${++i}`
  }

  it('parents nested spans and records start/end times', () => {
    const tracer = new Tracer({ now: clock(), idGenerator: ids(), traceId: 'trace-1' })
    const root = tracer.startSpan('agent', 'agent')
    const child = tracer.startSpan('llm', 'llm')
    tracer.endSpan(child, { code: 'ok' })
    tracer.endSpan(root)

    const trace = tracer.trace
    expect(trace.traceId).toBe('trace-1')
    expect(trace.spans).toHaveLength(2)
    expect(trace.spans[0]!.parentSpanId).toBeUndefined()
    expect(trace.spans[1]!.parentSpanId).toBe(root.spanId)
    expect(trace.spans[0]!.startTime).toBe(10)
    expect(trace.spans[1]!.startTime).toBe(20)
    expect(trace.spans[1]!.endTime).toBe(30)
    expect(trace.spans[1]!.status).toEqual({ code: 'ok' })
  })

  it('throws when spans are ended out of LIFO order', () => {
    const tracer = new Tracer({ now: clock(), idGenerator: ids() })
    const parent = tracer.startSpan('parent', 'agent')
    const child = tracer.startSpan('child', 'llm')
    expect(() => tracer.endSpan(parent)).toThrow(/LIFO/)
    tracer.endSpan(child)
  })

  it('adds events and attributes', () => {
    const tracer = new Tracer({ now: clock(), idGenerator: ids() })
    const span = tracer.startSpan('s', 'llm', { 'gen_ai.operation.name': 'chat' })
    tracer.setAttribute(span, 'gen_ai.request.model', 'gpt-4')
    tracer.addEvent(span, { name: 'prompt.sent', timestamp: 42 })
    tracer.endSpan(span)

    expect(span.attributes['gen_ai.request.model']).toBe('gpt-4')
    expect(span.events).toEqual([{ name: 'prompt.sent', timestamp: 42 }])
  })

  it('copies initial attributes so callers cannot mutate the span through them', () => {
    const tracer = new Tracer({ idGenerator: ids() })
    const attributes = { key: 'original' }
    const span = tracer.startSpan('s', 'internal', attributes)
    attributes.key = 'mutated'
    expect(span.attributes.key).toBe('original')
  })

  it('uses default id and clock sources when not injected', () => {
    const tracer = new Tracer({ traceId: 't-default' })
    const span = tracer.startSpan('s', 'internal')
    expect(span.spanId.length).toBeGreaterThan(0)
    expect(span.startTime).toBeGreaterThan(0)
    tracer.endSpan(span)
    expect(span.endTime).toBeGreaterThanOrEqual(span.startTime)
  })
})
