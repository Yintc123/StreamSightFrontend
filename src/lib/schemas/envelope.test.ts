import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { SuccessEnvelope, ErrorEnvelope, ErrorPayload } from './envelope'

describe('SuccessEnvelope', () => {
  const StringEnv = SuccessEnvelope(z.string())

  it('accepts data only', () => {
    expect(StringEnv.parse({ data: 'x' })).toEqual({ data: 'x' })
  })

  it('accepts data + meta', () => {
    expect(StringEnv.parse({ data: 'x', meta: { count: 1 } })).toEqual({
      data: 'x',
      meta: { count: 1 },
    })
  })

  it('rejects missing data', () => {
    expect(() => StringEnv.parse({ meta: {} })).toThrow()
  })

  it('rejects wrong data type', () => {
    expect(() => StringEnv.parse({ data: 123 })).toThrow()
  })
})

describe('ErrorEnvelope / ErrorPayload', () => {
  it('accepts proper shape', () => {
    expect(
      ErrorEnvelope.parse({
        error: { code: 'X', message: 'm', requestId: 'r' },
      }),
    ).toEqual({ error: { code: 'X', message: 'm', requestId: 'r' } })
  })

  it('rejects missing fields', () => {
    expect(() => ErrorEnvelope.parse({ error: { code: 'X' } })).toThrow()
    expect(() => ErrorPayload.parse({ code: 'X', message: 'm' })).toThrow()
  })
})
