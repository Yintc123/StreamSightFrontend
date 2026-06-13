import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseBody, parseQuery, parsePathParams } from './parsers'
import { MAX_BODY_BYTES } from './constants'

const Body = z.object({ name: z.string(), count: z.number() })
type Body = z.infer<typeof Body>

const Query = z.object({ q: z.string(), limit: z.coerce.number().optional() })

function jsonRequest(body: unknown, headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('parseBody', () => {
  it('parses and validates a valid body', async () => {
    const req = jsonRequest({ name: 'Alice', count: 3 })
    const result = await parseBody<Body>(req, Body)
    expect(result).toEqual({ name: 'Alice', count: 3 })
  })

  it('throws VALIDATION_ERROR when schema rejects', async () => {
    const req = jsonRequest({ name: 'Alice' }) // missing count
    await expect(parseBody(req, Body)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
    })
  })

  it('throws VALIDATION_ERROR for invalid JSON', async () => {
    const req = jsonRequest('{ not json')
    await expect(parseBody(req, Body)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('throws PAYLOAD_TOO_LARGE when Content-Length exceeds limit', async () => {
    // Hand-roll a Request-shaped object; the real Request constructor recomputes
    // content-length from the body, defeating the precheck-only assertion.
    const fakeReq = {
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(MAX_BODY_BYTES + 1),
      }),
      body: null,
    } as unknown as Request
    await expect(parseBody(fakeReq, Body)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      httpStatus: 413,
    })
  })

  it('throws PAYLOAD_TOO_LARGE when streamed body exceeds limit (no Content-Length)', async () => {
    // ReadableStream emitting > 1MB without a Content-Length header
    const chunkSize = 100_000
    const chunks = Math.ceil((MAX_BODY_BYTES + 1) / chunkSize)
    const stream = new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(chunkSize).fill(0x20) // ASCII space
        for (let i = 0; i < chunks; i++) controller.enqueue(chunk)
        controller.close()
      },
    })
    const req = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error — Node's undici requires this for streamed bodies
      duplex: 'half',
    })
    await expect(parseBody(req, Body)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    })
  })

  it('throws VALIDATION_ERROR for invalid UTF-8', async () => {
    // 0xff is not a valid UTF-8 byte sequence
    const badBytes = new Uint8Array([0xff, 0xfe, 0xfd])
    const req = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: badBytes,
    })
    await expect(parseBody(req, Body)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('handles empty body when schema allows undefined', async () => {
    const Opt = z.undefined()
    const req = new Request('http://localhost/api/x', { method: 'POST' })
    const result = await parseBody(req, Opt)
    expect(result).toBeUndefined()
  })
})

describe('parseQuery', () => {
  it('parses query params and applies Zod', () => {
    const req = new Request('http://localhost/api/x?q=hello&limit=10')
    expect(parseQuery(req, Query)).toEqual({ q: 'hello', limit: 10 })
  })

  it('rejects when required field missing', () => {
    const req = new Request('http://localhost/api/x?limit=10')
    expect(() => parseQuery(req, Query)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    )
  })
})

describe('parsePathParams', () => {
  const Params = z.object({ id: z.string().uuid() })

  it('passes valid params', () => {
    const validUuid = 'a3bb189e-8bf9-4030-9b0a-2e3a44e6c6ca'
    expect(parsePathParams({ id: validUuid }, Params)).toEqual({ id: validUuid })
  })

  it('rejects bad UUID', () => {
    expect(() => parsePathParams({ id: 'not-uuid' }, Params)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    )
  })
})
