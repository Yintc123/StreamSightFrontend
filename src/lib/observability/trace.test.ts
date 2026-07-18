import { describe, it, expect, beforeEach, vi } from 'vitest'

// Control the "active span" the trace module sees. isSpanContextValid mirrors
// OTel's real rule closely enough for the unit: reject the all-zero trace id.
const state = vi.hoisted(() => ({
  span: null as { spanContext: () => { traceId: string; spanId: string; traceFlags: number } } | null,
}))

vi.mock('@opentelemetry/api', () => ({
  trace: { getActiveSpan: () => state.span },
  isSpanContextValid: (sc: { traceId: string; spanId: string }) =>
    !!sc && sc.traceId !== '0'.repeat(32) && sc.spanId !== '0'.repeat(16),
}))

import {
  currentTraceId,
  currentSpanId,
  traceFieldsForLog,
  outboundTraceHeaders,
  deriveSessionCorrelationId,
  outboundBaggageHeaders,
} from './trace'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'

function setSpan(traceId: string, spanId: string, traceFlags: number) {
  state.span = { spanContext: () => ({ traceId, spanId, traceFlags }) }
}

beforeEach(() => {
  state.span = null
})

describe('active span readers', () => {
  it('no active span → all null / empty', () => {
    expect(currentTraceId()).toBeNull()
    expect(currentSpanId()).toBeNull()
    expect(traceFieldsForLog()).toEqual({ traceId: null, spanId: null })
    expect(outboundTraceHeaders()).toEqual({})
  })

  it('active span → traceId / spanId', () => {
    setSpan(TRACE_ID, SPAN_ID, 1)
    expect(currentTraceId()).toBe(TRACE_ID)
    expect(currentSpanId()).toBe(SPAN_ID)
    expect(traceFieldsForLog()).toEqual({ traceId: TRACE_ID, spanId: SPAN_ID })
  })

  it('invalid (all-zero) span context → treated as none', () => {
    setSpan('0'.repeat(32), '0'.repeat(16), 0)
    expect(currentTraceId()).toBeNull()
    expect(outboundTraceHeaders()).toEqual({})
  })
})

describe('outboundTraceHeaders', () => {
  it('builds a W3C traceparent, sampled flag 01', () => {
    setSpan(TRACE_ID, SPAN_ID, 1)
    expect(outboundTraceHeaders()).toEqual({
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    })
  })

  it('not-sampled flag 00', () => {
    setSpan(TRACE_ID, SPAN_ID, 0)
    expect(outboundTraceHeaders().traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-00`)
  })
})

describe('deriveSessionCorrelationId', () => {
  it('is stable, 16-hex, and never equals the raw input', () => {
    const a = deriveSessionCorrelationId('42:1700000000000')
    const b = deriveSessionCorrelationId('42:1700000000000')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(a).not.toBe('42:1700000000000')
  })

  it('differs for different inputs', () => {
    expect(deriveSessionCorrelationId('a')).not.toBe(deriveSessionCorrelationId('b'))
  })
})

describe('outboundBaggageHeaders', () => {
  it('emits session.id (derived from userId:createdAt) + enduser.id', () => {
    const { baggage } = outboundBaggageHeaders({ userId: '42', createdAt: 1700000000000 })
    const derived = deriveSessionCorrelationId('42:1700000000000')
    expect(baggage).toBe(`session.id=${derived},enduser.id=42`)
  })

  it('no session → empty', () => {
    expect(outboundBaggageHeaders(null)).toEqual({})
  })

  it('never leaks a raw sessionId/token (only derived id + principal id)', () => {
    const { baggage } = outboundBaggageHeaders({ userId: '42', createdAt: 1700000000000 })
    expect(baggage).toMatch(/^session\.id=[0-9a-f]{16},enduser\.id=42$/)
  })

  it('distinct sessions of the same user get distinct session.id', () => {
    const a = outboundBaggageHeaders({ userId: '42', createdAt: 1 }).baggage
    const b = outboundBaggageHeaders({ userId: '42', createdAt: 2 }).baggage
    expect(a).not.toBe(b)
  })
})
