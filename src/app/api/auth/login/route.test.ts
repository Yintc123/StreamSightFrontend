import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'

vi.mock('@/lib/config', () => ({
  env: {
    NODE_ENV: 'test',
    USE_MOCK: '0',
    BACKEND_API_URL: 'http://backend.test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'streamsight_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'streamsight-bff-test',
    APP_VERSION: '0.0.0-test',
    NEXT_PUBLIC_APP_NAME: 'StreamSight',
  },
}))

const createMock = vi.fn().mockResolvedValue({
  sessionId: 's'.repeat(43),
  csrfToken: 'c'.repeat(43),
})

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockResolvedValue(null),
    create: createMock,
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => true,
  }),
}))

import { mockBackend } from '../../../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'
import { POST } from './route'

const noParams = { params: Promise.resolve({}) }

const DEFAULT_BODY = { identifier: 'admin', password: 'admin-dev-password-change-me' }

function bodyStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// `new Request()` strips forbidden headers like Origin, so we hand-roll a
// Request-shaped object. parseBody() reads through `.body.getReader()`, so
// we wrap the JSON in a real ReadableStream (matches the prod runtime).
function postReq(
  body: Record<string, unknown> | null = DEFAULT_BODY,
  origin = 'http://localhost:3000',
): Request {
  const headers = new Headers()
  headers.set('origin', origin)
  headers.set('content-type', 'application/json')
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/auth/login',
    headers,
    body: body === null ? null : bodyStream(JSON.stringify(body)),
  } as unknown as Request
}

const ADMIN_ID = '00000000-0000-4000-8000-0000000000ad'

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

function stubBeAuth(opts: { roleInJwt?: 0 | 1; roleInMe?: 0 | 1 | null } = {}) {
  const { roleInJwt = 0, roleInMe = null } = opts
  mockBackend('post', 'http://backend.test/auth/login', () =>
    HttpResponse.json(
      {
        accessToken: jwt({ sub: ADMIN_ID, type: 'access', role: roleInJwt }),
        refreshToken: jwt({ sub: ADMIN_ID, type: 'refresh' }),
        accessExpiresIn: 3 * 60 * 60,
        refreshExpiresIn: 30 * 24 * 60 * 60,
        tokenType: 'Bearer',
      },
      { status: 200 },
    ),
  )
  mockBackend('get', 'http://backend.test/auth/me', () => {
    const body: Record<string, unknown> = {
      id: ADMIN_ID,
      username: 'admin',
      email: null,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    }
    // BE 008 §6.4 doesn't actually return role; the test default omits it
    // so the JWT-decode path is the one exercised. Tests can opt-in.
    if (roleInMe !== null) body.role = roleInMe
    return HttpResponse.json(body, { status: 200 })
  })
}

beforeEach(() => {
  _resetMockRegistry()
  createMock.mockClear().mockResolvedValue({
    sessionId: 's'.repeat(43),
    csrfToken: 'c'.repeat(43),
  })
})

describe('POST /api/auth/login', () => {
  it('happy path → BE /auth/login + /auth/me + role decoded from JWT (BE /me omits role) → session ADMIN + 200', async () => {
    stubBeAuth({ roleInJwt: 0 }) // /me omits role; JWT claim wins
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.sessionId).toHaveLength(43)
    expect(body.data.csrfToken).toHaveLength(43)
    expect(body.data.user.id).toBe(ADMIN_ID)
    expect(createMock).toHaveBeenCalledTimes(1)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(0)
  })

  it('missing body → 400 ValidationError', async () => {
    stubBeAuth()
    const res = await POST(postReq(null), noParams)
    expect(res.status).toBe(400)
  })

  it('body missing identifier → 400 ValidationError', async () => {
    stubBeAuth()
    const res = await POST(postReq({ password: 'x' }), noParams)
    expect(res.status).toBe(400)
  })

  it('foreign Origin → 403', async () => {
    stubBeAuth()
    const res = await POST(postReq(DEFAULT_BODY, 'http://evil.com'), noParams)
    expect(res.status).toBe(403)
  })

  it('JWT claim role=1 → session stored as role=USER (seed not promoted)', async () => {
    stubBeAuth({ roleInJwt: 1 })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(1)
  })

  it('BE /me returns role → /me value wins over JWT claim (future-proof)', async () => {
    stubBeAuth({ roleInJwt: 1, roleInMe: 0 })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(0)
  })

  it('ttl values match BE accessExpiresIn / refreshExpiresIn', async () => {
    stubBeAuth({ roleInJwt: 0 })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    const { tokens } = args as {
      tokens: { accessTokenExpiresAt: number; refreshTokenExpiresAt: number }
    }
    const now = Date.now()
    const accessTtl = tokens.accessTokenExpiresAt - now
    const refreshTtl = tokens.refreshTokenExpiresAt - now
    expect(accessTtl).toBeGreaterThan(3 * 60 * 60_000 - 1000)
    expect(accessTtl).toBeLessThan(3 * 60 * 60_000 + 1000)
    expect(refreshTtl).toBeGreaterThan(30 * 24 * 60 * 60_000 - 1000)
    expect(refreshTtl).toBeLessThan(30 * 24 * 60 * 60_000 + 1000)
  })
})
