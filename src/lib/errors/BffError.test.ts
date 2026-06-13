import { describe, it, expect } from 'vitest'
import { BffError } from './BffError'
import { ValidationError } from './ValidationError'
import { UnauthenticatedError } from './UnauthenticatedError'
import { CsrfError } from './CsrfError'
import { NotFoundError } from './NotFoundError'
import { PayloadTooLargeError } from './PayloadTooLargeError'
import { BackendTimeoutError } from './BackendTimeoutError'
import { BackendUpstreamError } from './BackendUpstreamError'
import { ContractViolationError } from './ContractViolationError'

describe('BffError', () => {
  it('preserves code, httpStatus, message, and cause', () => {
    const cause = new Error('root')
    const err = new BffError('INTERNAL_ERROR', 500, 'boom', cause)
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.httpStatus).toBe(500)
    expect(err.message).toBe('boom')
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })

  it('cause is optional', () => {
    const err = new BffError('INTERNAL_ERROR', 500, 'boom')
    expect(err.cause).toBeUndefined()
  })

  it('name reflects the subclass constructor', () => {
    expect(new ValidationError('x').name).toBe('ValidationError')
    expect(new BackendTimeoutError('x').name).toBe('BackendTimeoutError')
  })
})

describe('derived error classes', () => {
  const cases: Array<[new (msg: string, cause?: unknown) => BffError, string, number]> = [
    [ValidationError, 'VALIDATION_ERROR', 400],
    [UnauthenticatedError, 'UNAUTHENTICATED', 401],
    [CsrfError, 'CSRF_INVALID', 403],
    [NotFoundError, 'NOT_FOUND', 404],
    [PayloadTooLargeError, 'PAYLOAD_TOO_LARGE', 413],
    [BackendTimeoutError, 'BACKEND_TIMEOUT', 504],
    [BackendUpstreamError, 'BACKEND_UPSTREAM_ERROR', 502],
    [ContractViolationError, 'CONTRACT_VIOLATION', 502],
  ]

  it.each(cases)('%o → code & status', (Ctor, code, status) => {
    const err = new Ctor('msg', new Error('cause'))
    expect(err).toBeInstanceOf(BffError)
    expect(err.code).toBe(code)
    expect(err.httpStatus).toBe(status)
    expect(err.message).toBe('msg')
    expect((err.cause as Error).message).toBe('cause')
  })
})
