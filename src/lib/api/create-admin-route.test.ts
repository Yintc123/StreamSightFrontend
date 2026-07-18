import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Role, type StoredSession } from '@/lib/session/types'

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

import { createAdminRoute } from './create-admin-route'
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
    role: Role.ADMIN,
    adminRole: 'super_admin',
    csrfToken: 'csrf-token-' + 'a'.repeat(32),
    createdAt: now,
    ...over,
  }
}

function makeReq(opts: {
  method: string
  body?: unknown
  origin?: string | null
  csrfToken?: string
}): Request {
  const headers = new Headers()
  if (opts.origin !== null) headers.set('origin', opts.origin ?? 'http://localhost:3000')
  if (opts.body !== undefined) headers.set('content-type', 'application/json')
  if (opts.csrfToken) headers.set('x-csrf-token', opts.csrfToken)
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
    url: 'http://localhost:3000/api/cms/admins',
    headers,
    body,
  } as unknown as Request
}

const noParams = { params: Promise.resolve({}) }
const get = () => makeReq({ method: 'GET' })

beforeEach(() => {
  overrides.session = null
  overrides.wasMutated = false
  touchMock.mockClear()
  getMock.mockReset().mockImplementation(async () => overrides.session)
})

describe('createAdminRoute — SUPER_ADMIN gate', () => {
  it('no session → UNAUTHENTICATED 401', async () => {
    overrides.session = null
    const handler = createAdminRoute({ handler: () => okResponse({ ok: 1 }) })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED')
  })

  it('role=USER session → FORBIDDEN 403', async () => {
    overrides.session = makeSession({ role: Role.USER, adminRole: undefined })
    const handler = createAdminRoute({ handler: () => okResponse({ ok: 1 }) })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it('admin but adminRole=viewer → FORBIDDEN 403', async () => {
    overrides.session = makeSession({ adminRole: 'viewer' })
    const handler = createAdminRoute({ handler: () => okResponse({ ok: 1 }) })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(403)
  })

  it('admin but adminRole=editor → FORBIDDEN 403', async () => {
    overrides.session = makeSession({ adminRole: 'editor' })
    const handler = createAdminRoute({ handler: () => okResponse({ ok: 1 }) })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(403)
  })

  it('super_admin → handler runs, session is non-null', async () => {
    overrides.session = makeSession()
    let sessionSeen: StoredSession | null = null
    const handler = createAdminRoute({
      handler: ({ session }) => {
        sessionSeen = session
        return okResponse({ ok: 1 })
      },
    })
    const res = await handler(get(), noParams)
    expect(res.status).toBe(200)
    expect(sessionSeen).not.toBeNull()
  })

  it('non-safe method without CSRF token → CSRF_INVALID 403 (before gate body runs)', async () => {
    overrides.session = makeSession()
    const handler = createAdminRoute({ handler: () => okResponse({ ok: 1 }) })
    const res = await handler(
      makeReq({ method: 'POST', body: { a: 1 } }),
      noParams,
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('CSRF_INVALID')
  })
})
