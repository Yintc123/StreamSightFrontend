import { describe, it, expect } from 'vitest'
import { toErrorResponse } from './toErrorResponse'
import { BffError } from './BffError'
import { ValidationError } from './ValidationError'
import { UnauthenticatedError } from './UnauthenticatedError'
import { CsrfError } from './CsrfError'
import { NotFoundError } from './NotFoundError'
import { PayloadTooLargeError } from './PayloadTooLargeError'
import { BackendTimeoutError } from './BackendTimeoutError'
import { BackendUpstreamError } from './BackendUpstreamError'
import { ContractViolationError } from './ContractViolationError'

const REQ_ID = 'req_2026-06-13_abcdef12'

async function readEnvelope(res: Response) {
  return (await res.json()) as { error: { code: string; message: string; requestId: string } }
}

describe('toErrorResponse', () => {
  const cases: Array<[new (msg: string) => BffError, string, number]> = [
    [ValidationError, 'VALIDATION_ERROR', 400],
    [UnauthenticatedError, 'UNAUTHENTICATED', 401],
    [CsrfError, 'CSRF_INVALID', 403],
    [NotFoundError, 'NOT_FOUND', 404],
    [PayloadTooLargeError, 'PAYLOAD_TOO_LARGE', 413],
    [BackendTimeoutError, 'BACKEND_TIMEOUT', 504],
    [BackendUpstreamError, 'BACKEND_UPSTREAM_ERROR', 502],
    [ContractViolationError, 'CONTRACT_VIOLATION', 502],
  ]

  it.each(cases)('maps %o → envelope + status', async (Ctor, code, status) => {
    const res = toErrorResponse(new Ctor('boom'), REQ_ID)
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    const body = await readEnvelope(res)
    expect(body).toEqual({
      error: { code, message: 'boom', requestId: REQ_ID },
    })
  })

  it('unknown error falls back to INTERNAL_ERROR with generic message', async () => {
    const res = toErrorResponse(new Error('leaky detail'), REQ_ID)
    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    const body = await readEnvelope(res)
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: REQ_ID },
    })
    expect(body.error.message).not.toContain('leaky')
  })

  it('non-Error thrown values still produce INTERNAL_ERROR', async () => {
    const res = toErrorResponse('string thrown', REQ_ID)
    expect(res.status).toBe(500)
    const body = await readEnvelope(res)
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
