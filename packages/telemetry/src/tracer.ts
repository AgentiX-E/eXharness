import type { AttributeValue, Span, SpanEvent, SpanKind, SpanStatus, Trace } from './types.js'

/**
 * Generate a random, unique span/trace id. `randomUUID` and `crypto` are
 * injectable so the fallback path is testable; pass `null` to force it.
 */
export function generateId(randomUUID?: (() => string) | null, crypto?: { randomUUID?: () => string }): string {
  if (randomUUID !== undefined) return randomUUID === null ? fallbackId() : randomUUID()
  const c = crypto ?? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return fallbackId()
}

function fallbackId(): string {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface TracerOptions {
  /** Explicit trace id (defaults to a generated id). */
  traceId?: string
  /** Clock source (defaults to Date.now). */
  now?: () => number
  /** Id source (defaults to `generateId`). */
  idGenerator?: () => string
}

/**
 * A minimal, dependency-free span tracer. Spans form a stack: `startSpan`
 * parents a new span under the current top, and `endSpan` must pop the top
 * (LIFO) — this enforces well-formed span nesting in the produced trace.
 */
export class Tracer {
  private readonly traceId: string
  private readonly now: () => number
  private readonly idGenerator: () => string
  private readonly spans: Span[] = []
  private readonly stack: Span[] = []

  constructor(options: TracerOptions = {}) {
    this.traceId = options.traceId ?? generateId()
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? generateId
  }

  /** Start a span (parented to the current top of the stack, if any). */
  startSpan(name: string, kind: SpanKind, attributes: Record<string, AttributeValue> = {}): Span {
    const parent = this.stack[this.stack.length - 1]
    const span: Span = {
      name,
      kind,
      traceId: this.traceId,
      spanId: this.idGenerator(),
      parentSpanId: parent?.spanId,
      startTime: this.now(),
      attributes: { ...attributes },
      events: [],
    }
    this.spans.push(span)
    this.stack.push(span)
    return span
  }

  /** End a span; the span must be the current top (LIFO). */
  endSpan(span: Span, status?: SpanStatus): void {
    const top = this.stack[this.stack.length - 1]
    if (top !== span) throw new Error('Tracer: spans must be ended in LIFO order')
    this.stack.pop()
    span.endTime = this.now()
    if (status !== undefined) span.status = status
  }

  /** Record a timestamped event on a span. */
  addEvent(span: Span, event: SpanEvent): void {
    span.events.push(event)
  }

  /** Set or replace an attribute on a span. */
  setAttribute(span: Span, key: string, value: AttributeValue): void {
    span.attributes[key] = value
  }

  /** The trace accumulated so far (spans in start order). */
  get trace(): Trace {
    return { traceId: this.traceId, spans: [...this.spans] }
  }
}
