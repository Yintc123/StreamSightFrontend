import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredSession } from '@/lib/session/types'

vi.mock('@/lib/config', () => ({
  env: {
    NODE_ENV: 'test',
    USE_MOCK: '0',
    BACKEND_API_URL: 'http://backend.test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'streamsight_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:8501',
    REDIS_KEY_PREFIX: 'streamsight-bff-test',
    APP_VERSION: '0.0.0-test',
    NEXT_PUBLIC_APP_NAME: 'StreamSight',
  },
}))

const { getMock, destroyMock, backendFetchMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  destroyMock: vi.fn().mockResolvedValue(undefined),
  backendFetchMock: vi.fn(),
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: getMock,
    destroy: destroyMock,
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: vi.fn().mockReturnValue(true),
  }),
}))

vi.mock('@/lib/api/backend', () => ({
  backendFetch: backendFetchMock,
}))

import { POST } from './route'
import { GET } from '../session/route'

const noParams = { params: Promise.resolve({}) }
const NOW = Date.now()
const CSRF_TOKEN = 'c'.repeat(43)

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    userId: 'u_123',
    accessToken: 'access-token-abc',
    accessTokenExpiresAt: NOW + 120_000,
    refreshToken: 'refresh-token-xyz',
    refreshTokenExpiresAt: NOW + 86_400_000,
    user: { id: 'u_123', name: 'alice' },
    role: 0,
    csrfToken: CSRF_TOKEN,
    createdAt: NOW - 60_000,
    ...overrides,
  }
}

function getReq(): Request {
  return {
    method: 'GET',
    url: 'http://localhost:3000/api/auth/session',
    headers: new Headers({ cookie: 'streamsight_session=sealed' }),
  } as unknown as Request
}

function postReq(opts: {
  origin?: string
  csrfToken?: string | null
} = {}): Request {
  const { origin = 'http://localhost:8501', csrfToken = CSRF_TOKEN } = opts
  const headers = new Headers({ 'content-type': 'application/json' })
  if (origin) headers.set('origin', origin)
  if (csrfToken !== null) headers.set('x-csrf-token', csrfToken)
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/auth/logout',
    headers,
    body: null,
  } as unknown as Request
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    destroyMock.mockResolvedValue(undefined)
    backendFetchMock.mockResolvedValue({ data: null })
  })

  it('test 7: valid session + allowed Origin + correct X-CSRF-Token → backend logout called → destroy called → 204', async () => {
    getMock.mockResolvedValue(makeSession())
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(204)
    expect(backendFetchMock).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      body: { refresh_token: 'refresh-token-xyz' },
      session: null,
    })
    expect(destroyMock).toHaveBeenCalledOnce()
  })

  it('test 8: missing Origin → 403 CSRF_INVALID', async () => {
    getMock.mockResolvedValue(makeSession())
    const req = postReq({ origin: '' })
    const headers = new Headers(req.headers)
    headers.delete('origin')
    const noOriginReq = { ...req, headers } as unknown as Request
    const res = await POST(noOriginReq, noParams)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CSRF_INVALID')
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('test 8b: foreign Origin → 403 CSRF_INVALID', async () => {
    getMock.mockResolvedValue(makeSession())
    const res = await POST(postReq({ origin: 'http://evil.com' }), noParams)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CSRF_INVALID')
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('test 9: valid Origin + wrong X-CSRF-Token → 403 CSRF_INVALID', async () => {
    getMock.mockResolvedValue(makeSession())
    const res = await POST(postReq({ csrfToken: 'wrong-token-' + 'x'.repeat(31) }), noParams)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CSRF_INVALID')
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('test 10: no session → 403 CSRF_INVALID (CSRF check sees null session)', async () => {
    getMock.mockResolvedValue(null)
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('CSRF_INVALID')
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('test 11: localhost:3000 origin also accepted → backend logout called', async () => {
    getMock.mockResolvedValue(makeSession())
    const res = await POST(postReq({ origin: 'http://localhost:3000' }), noParams)
    expect(res.status).toBe(204)
    expect(backendFetchMock).toHaveBeenCalledOnce()
    expect(destroyMock).toHaveBeenCalledOnce()
  })

  it('test 11b: after successful destroy, GET /api/auth/session → 401 UNAUTHENTICATED', async () => {
    getMock.mockResolvedValue(makeSession())
    const logoutRes = await POST(postReq(), noParams)
    expect(logoutRes.status).toBe(204)
    expect(destroyMock).toHaveBeenCalledOnce()

    getMock.mockResolvedValue(null)
    const sessionRes = await GET(getReq(), noParams)
    expect(sessionRes.status).toBe(401)
    const body = await sessionRes.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('test 12: null refreshToken → backend logout NOT called, local session still destroyed → 204', async () => {
    getMock.mockResolvedValue(makeSession({ refreshToken: null }))
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(204)
    expect(backendFetchMock).not.toHaveBeenCalled()
    expect(destroyMock).toHaveBeenCalledOnce()
  })

  it('test 13: backend logout fails (network error) → local session still destroyed → 204', async () => {
    getMock.mockResolvedValue(makeSession())
    backendFetchMock.mockRejectedValue(new Error('Network error'))
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(204)
    expect(backendFetchMock).toHaveBeenCalledOnce()
    expect(destroyMock).toHaveBeenCalledOnce()
  })
})
