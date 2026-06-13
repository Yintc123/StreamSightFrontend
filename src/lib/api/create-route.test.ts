import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import type { StoredSession } from '@/lib/session/types'

const overrides = vi.hoisted(() => ({
  session: null as StoredSession | null,
  wasMutated: false,
}))

const touchMock = vi.fn().mockResolvedValue(undefined)
const getMock = vi.fn()

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: getMock,
    touch: touchMock,
    wasMutated: () => overrides.wasMutated,
  }),
}))

import { createRoute } from './create-route'
import { okResponse } from './responses'

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'u1', name: 'Alice' },
    csrfToken: 'csrf-token-' + 'a'.repeat(32),
    createdAt: now,
    ...over,
  }
}

/**
 * Origin is on fetch's forbidden-header list, so `new Request({ headers: { origin } })`
 * silently strips it. Hand-roll a Request-shaped object exposing the fields createRoute
 * actually reads (method, url, headers, body).
 */
function makeReq(opts: {
  method: string
  url?: string
  body?: unknown
  origin?: string | null
  csrfToken?: string
  extraHeaders?: Record<string, string>
}): Request {
  const headers = new Headers()
  if (opts.origin !== null) headers.set('origin', opts.origin ?? 'http://localhost:3000')
  if (opts.body !== undefined) headers.set('content-type', 'application/json')
  if (opts.csrfToken) headers.set('x-csrf-token', opts.csrfToken)
  for (const [k, v] of Object.entries(opts.extraHeaders ?? {})) headers.set(k, v)
  const body =
    opts.body === undefined
      ? null
      : new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(JSON.stringify(opts.body)))
            c.close()
          },
        })
  return {
    method: opts.method,
    url: opts.url ?? 'http://localhost:3000/api/x',
    headers,
    body,
  } as unknown as Request
}

function get(url = 'http://localhost:3000/api/x'): Request {
  return makeReq({ method: 'GET', url })
}

function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  const { 'x-csrf-token': csrfToken, ...rest } = headers
  return makeReq({ method: 'POST', url, body, csrfToken, extraHeaders: rest })
}

const noParams = { params: Promise.resolve({}) }

beforeEach(() => {
  overrides.session = null
  overrides.wasMutated = false
  touchMock.mockClear()
  getMock.mockReset().mockImplementation(async () => overrides.session)
})

describe('happy path', () => {
  it('GET no schema, no auth → 200 + envelope + no-store', async () => {
    const handler = createRoute({
      handler: () => okResponse({ ok: 1 }),
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(await res.json()).toEqual({ data: { ok: 1 } })
  })
})

describe('schema validation', () => {
  it('paramsSchema fail → VALIDATION_ERROR 400', async () => {
    const handler = createRoute({
      paramsSchema: z.object({ id: z.string().uuid() }),
      handler: () => okResponse(null),
    })
    const res = await handler(get(), { params: Promise.resolve({ id: 'not-uuid' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('querySchema fail → VALIDATION_ERROR 400', async () => {
    const handler = createRoute({
      querySchema: z.object({ q: z.string() }),
      handler: () => okResponse(null),
    })
    const res = await handler(get('http://localhost:3000/api/x'), noParams)
    expect(res.status).toBe(400)
  })

  it('bodySchema fail → VALIDATION_ERROR 400', async () => {
    overrides.session = makeSession()
    const handler = createRoute({
      bodySchema: z.object({ name: z.string() }),
      csrfExempt: true,
      handler: () => okResponse(null),
    })
    const res = await handler(post('http://localhost:3000/api/x', { wrong: 1 }), noParams)
    expect(res.status).toBe(400)
  })

  it('step order: paramsSchema fails before querySchema', async () => {
    let querySeen = false
    const handler = createRoute({
      paramsSchema: z.object({ id: z.string().min(20) }),
      querySchema: z
        .object({ q: z.string() })
        .transform((q) => {
          querySeen = true
          return q
        }),
      handler: () => okResponse(null),
    })
    await handler(get(), { params: Promise.resolve({ id: 'short' }) })
    expect(querySeen).toBe(false)
  })
})

describe('auth gate', () => {
  it('requireAuth: true + no session → UNAUTHENTICATED 401', async () => {
    overrides.session = null
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse(null),
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('requireAuth: false + no session → handler runs with session=null', async () => {
    overrides.session = null
    let received: StoredSession | null | undefined = undefined
    const handler = createRoute({
      handler: ({ session }) => {
        received = session
        return okResponse(null)
      },
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(200)
    expect(received).toBeNull()
  })

  it('session.get is called exactly once per request', async () => {
    overrides.session = makeSession()
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse(null),
    })
    await handler(get(), noParams)
    expect(getMock).toHaveBeenCalledTimes(1)
  })
})

describe('CSRF gate', () => {
  it('POST without X-CSRF-Token → CSRF_INVALID 403', async () => {
    overrides.session = makeSession()
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse(null),
    })
    const res = await handler(
      post('http://localhost:3000/api/x', { a: 1 }),
      noParams,
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CSRF_INVALID')
  })

  it('POST with wrong X-CSRF-Token → CSRF_INVALID 403', async () => {
    const session = makeSession()
    overrides.session = session
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse(null),
    })
    const res = await handler(
      post('http://localhost:3000/api/x', { a: 1 }, { 'x-csrf-token': 'wrong'.padEnd(session.csrfToken.length, 'x') }),
      noParams,
    )
    expect(res.status).toBe(403)
  })

  it('POST with matching token + valid origin → 200', async () => {
    const session = makeSession()
    overrides.session = session
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse({ ok: true }),
    })
    const res = await handler(
      post('http://localhost:3000/api/x', { a: 1 }, { 'x-csrf-token': session.csrfToken }),
      noParams,
    )
    expect(res.status).toBe(200)
  })

  it('POST from foreign Origin → CSRF_INVALID 403', async () => {
    overrides.session = makeSession()
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse(null),
    })
    const req = makeReq({ method: 'POST', body: { a: 1 }, origin: 'http://evil.com' })
    const res = await handler(req, noParams)
    expect(res.status).toBe(403)
  })

  it('csrfExempt: true → POST without token passes (Origin still checked)', async () => {
    overrides.session = null
    const handler = createRoute({
      csrfExempt: true,
      handler: () => okResponse({ ok: true }),
    })
    const res = await handler(
      post('http://localhost:3000/api/x', { a: 1 }),
      noParams,
    )
    expect(res.status).toBe(200)
  })

  it('csrfExempt: true but Origin rejected → CSRF_INVALID 403', async () => {
    const handler = createRoute({
      csrfExempt: true,
      handler: () => okResponse(null),
    })
    const req = makeReq({ method: 'POST', body: { a: 1 }, origin: 'http://evil.com' })
    const res = await handler(req, noParams)
    expect(res.status).toBe(403)
  })
})

describe('Cache-Control enforcement', () => {
  it('forces no-store even when handler sets its own Cache-Control', async () => {
    const handler = createRoute({
      handler: () =>
        new Response(JSON.stringify({ data: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
        }),
    })
    const res = await handler(get(), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})

describe('wasMutated / touch skipping', () => {
  it('calls touch() when session present and not mutated', async () => {
    overrides.session = makeSession()
    overrides.wasMutated = false
    const handler = createRoute({
      requireAuth: true,
      handler: () => okResponse({ ok: true }),
    })
    await handler(get(), noParams)
    expect(touchMock).toHaveBeenCalledTimes(1)
  })

  it('skips touch() when handler-side mutation already happened', async () => {
    overrides.session = makeSession()
    const handler = createRoute({
      requireAuth: true,
      handler: () => {
        overrides.wasMutated = true // handler did update/refresh/destroy
        return okResponse({ ok: true })
      },
    })
    await handler(get(), noParams)
    expect(touchMock).not.toHaveBeenCalled()
  })

  it('does not touch when no session', async () => {
    overrides.session = null
    const handler = createRoute({
      handler: () => okResponse(null),
    })
    await handler(get(), noParams)
    expect(touchMock).not.toHaveBeenCalled()
  })
})

describe('error mapping', () => {
  it('unknown thrown error → INTERNAL_ERROR 500, no stack leak', async () => {
    const handler = createRoute({
      handler: () => {
        throw new Error('boom internal stack with secret detail')
      },
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).not.toContain('secret detail')
    expect(JSON.stringify(body)).not.toMatch(/stack|at /)
  })

  it('handler-thrown BffError surfaces with correct status', async () => {
    const { NotFoundError } = await import('@/lib/errors')
    const handler = createRoute({
      handler: () => {
        throw new NotFoundError('nope')
      },
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(404)
  })
})

describe('logging', () => {
  it('logs bff.request.in and bff.response.out with requestId', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = createRoute({ handler: () => okResponse(null) })
    await handler(get(), noParams)
    const lines = consoleSpy.mock.calls.map((c) => JSON.parse(c[0] as string))
    const events = lines.map((l) => l.event)
    expect(events).toContain('bff.request.in')
    expect(events).toContain('bff.response.out')
    const reqIn = lines.find((l) => l.event === 'bff.request.in')
    expect(reqIn?.requestId).toMatch(/^req_/)
    consoleSpy.mockRestore()
  })
})
