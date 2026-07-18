import 'server-only'
import { createHash } from 'node:crypto'
import { trace, isSpanContextValid } from '@opentelemetry/api'

// Spec 001h §4 — thin read-only wrapper over the OTel trace API. It never
// manages span lifecycle (Next's built-in instrumentation opens the request
// span); it only reads the active span for logging + builds the outbound
// correlation headers that backendFetch injects (§5.1).

function activeSpanContext():
  | { traceId: string; spanId: string; traceFlags: number }
  | null {
  const sc = trace.getActiveSpan()?.spanContext()
  return sc && isSpanContextValid(sc) ? sc : null
}

export function currentTraceId(): string | null {
  return activeSpanContext()?.traceId ?? null
}

export function currentSpanId(): string | null {
  return activeSpanContext()?.spanId ?? null
}

export function traceFieldsForLog(): {
  traceId: string | null
  spanId: string | null
} {
  const sc = activeSpanContext()
  return { traceId: sc?.traceId ?? null, spanId: sc?.spanId ?? null }
}

/**
 * W3C `traceparent` for the active span, built manually from the span context
 * so it's deterministic + unit-testable without a global propagator. `{}` when
 * there is no valid active span.
 */
export function outboundTraceHeaders(): { traceparent?: string } {
  const sc = activeSpanContext()
  if (!sc) return {}
  const flags = (sc.traceFlags & 1).toString(16).padStart(2, '0')
  return { traceparent: `00-${sc.traceId}-${sc.spanId}-${flags}` }
}

/**
 * One-way, stable, non-reversible 16-hex correlation id (spec 001h §5.4/§10).
 * Safe for logs / baggage / query. Fed immutable per-session fields (NOT the
 * raw sessionId, which never leaves the httpOnly cookie and isn't available
 * where baggage is built — §5.4).
 */
export function deriveSessionCorrelationId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/**
 * W3C `baggage` header for the service-to-service hop (spec 001h §5.4), built
 * directly from the `StoredSession` that backendFetch already holds — NOT via
 * OTel baggage-context (which wouldn't propagate without a context scope), and
 * without an extra cookie read. Carries ONLY non-PII:
 *   - `session.id`  = derive(`${userId}:${createdAt}`) — immutable per-session
 *   - `enduser.id`  = principal_id (userId)
 */
export function outboundBaggageHeaders(
  session: { userId: string; createdAt: number } | null,
): { baggage?: string } {
  if (!session) return {}
  const sessionCorrelation = deriveSessionCorrelationId(
    `${session.userId}:${session.createdAt}`,
  )
  const baggage = [
    `session.id=${sessionCorrelation}`,
    `enduser.id=${encodeURIComponent(session.userId)}`,
  ].join(',')
  return { baggage }
}
