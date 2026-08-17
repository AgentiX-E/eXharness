import type { Span, Trace } from './types.js'

/**
 * Serialize a trace to JSON (attribute names already follow the OTel GenAI
 * conventions, so the payload is semantically OTLP-compatible; the exact
 * protobuf wire format is the responsibility of a dedicated exporter).
 */
export function serializeTrace(trace: Trace, pretty = false): string {
  return JSON.stringify(trace, null, pretty ? 2 : undefined)
}

/** Parse a JSON trace back into a `Trace`, validating its top-level shape. */
export function deserializeTrace(json: string): Trace {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (cause) {
    throw new Error('deserializeTrace: invalid JSON', { cause })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('deserializeTrace: expected a JSON object')
  }
  const record = parsed as Record<string, unknown>
  if (typeof record.traceId !== 'string') throw new Error('deserializeTrace: missing string traceId')
  if (!Array.isArray(record.spans)) throw new Error('deserializeTrace: missing spans array')
  return { traceId: record.traceId, spans: record.spans as Span[] }
}
