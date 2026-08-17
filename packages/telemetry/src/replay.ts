import type { AttributeValue, Span, SpanEvent, SpanKind, SpanStatus, Trace } from './types.js'

/**
 * An append-only trace log. Each event appends one fact about a span; replaying
 * the log rebuilds the full trace. This is the "data truth source" that can be
 * persisted (storage / Git) and later replayed for debugging or auditing.
 */
export type TraceEvent =
  | {
      type: 'span-start'
      traceId: string
      spanId: string
      parentSpanId?: string
      name: string
      kind: SpanKind
      startTime: number
      attributes?: Record<string, AttributeValue>
    }
  | { type: 'span-end'; spanId: string; endTime: number; status?: SpanStatus }
  | { type: 'attribute'; spanId: string; key: string; value: AttributeValue }
  | { type: 'event'; spanId: string; event: SpanEvent }

/**
 * Rebuild a trace from an append-only event log. Events must reference spans
 * declared by a prior `span-start`; unknown span ids are a hard error so that
 * corrupted logs fail loudly instead of silently dropping data.
 */
export function replay(events: readonly TraceEvent[]): Trace {
  const spans = new Map<string, Span>()
  let traceId: string | undefined

  for (const event of events) {
    switch (event.type) {
      case 'span-start': {
        if (traceId === undefined) traceId = event.traceId
        spans.set(event.spanId, {
          name: event.name,
          kind: event.kind,
          traceId: event.traceId,
          spanId: event.spanId,
          parentSpanId: event.parentSpanId,
          startTime: event.startTime,
          attributes: { ...event.attributes },
          events: [],
        })
        break
      }
      case 'span-end': {
        const span = requireSpan(spans, event.spanId)
        span.endTime = event.endTime
        if (event.status !== undefined) span.status = event.status
        break
      }
      case 'attribute': {
        const span = requireSpan(spans, event.spanId)
        span.attributes[event.key] = event.value
        break
      }
      case 'event': {
        const span = requireSpan(spans, event.spanId)
        span.events.push(event.event)
        break
      }
    }
  }

  if (traceId === undefined) throw new Error('replay: no span-start events in log')
  return { traceId, spans: [...spans.values()] }
}

function requireSpan(spans: ReadonlyMap<string, Span>, spanId: string): Span {
  const span = spans.get(spanId)
  if (span === undefined) throw new Error(`replay: unknown span id "${spanId}"`)
  return span
}
