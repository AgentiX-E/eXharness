/**
 * A lightweight, dependency-free span/trace model aligned with the
 * OpenTelemetry GenAI semantic conventions and the OpenInference span kinds.
 * It captures the structure needed for LLM/agent observability without pulling
 * in the OTel SDK; serialization emits OTLP-compatible JSON.
 */

/** Span kind, following OpenInference (`openinference.span.kind`). */
export type SpanKind = 'agent' | 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding' | 'internal'

export type AttributeValue = string | number | boolean | readonly (string | number)[]

export interface SpanEvent {
  name: string
  /** Unix epoch milliseconds. */
  timestamp: number
  attributes?: Record<string, AttributeValue>
}

export interface SpanStatus {
  code: 'ok' | 'error'
  message?: string
}

export interface Span {
  name: string
  kind: SpanKind
  traceId: string
  spanId: string
  parentSpanId?: string
  /** Unix epoch milliseconds. */
  startTime: number
  /** Unix epoch milliseconds (absent until the span is ended). */
  endTime?: number
  attributes: Record<string, AttributeValue>
  events: SpanEvent[]
  status?: SpanStatus
}

/** A complete trace: every span of one logical run, sharing a trace id. */
export interface Trace {
  traceId: string
  spans: Span[]
}
