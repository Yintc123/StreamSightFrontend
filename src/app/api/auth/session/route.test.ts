import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { BackendUpstreamError } from '@/lib/errors/BackendUpstreamError'
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

const { getMock, refreshMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: getMock,
    refresh: refreshMock,
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: vi.fn().mockReturnValue(false),
  }),
}))

import { GET } from './route'

const noParams = { params: Promise.resolve({}) }
const NOW = Date.now()

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    userId: 'u_123',
    accessToken: 'access-token-abc',
    accessTokenExpiresAt: NOW + 120_000,
    refreshToken: 'refresh-token-xyz',
    refreshTokenExpiresAt: NOW + 86_400_000,
    user: { id: 'u_123', name: 'alice' },
    role: 0,
    csrfToken: 'c'.repeat(43),
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

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('test 1: no session → 401 UNAUTHENTICATED', async () => {
    getMock.mockResolvedValue(null)
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('test 2: valid session + token not near expiry → 200 with correct fields, refresh not called', async () => {
    getMock.mockResolvedValue(makeSession({ accessTokenExpiresAt: NOW + 120_000 }))
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.user).toEqual({ id: 'u_123', name: 'alice' })
    expect(data.role).toBe(0)
    expect(data.accessToken).toBe('access-token-abc')
    expect(data.expiresAt).toBe(NOW + 120_000)
    expect(data.csrfToken).toBe('c'.repeat(43))
    expect(data.adminRole).toBeUndefined()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('test 2b: admin session includes adminRole', async () => {
    getMock.mockResolvedValue(
      makeSession({ role: 1, adminRole: 'super_admin', accessTokenExpiresAt: NOW + 120_000 }),
    )
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.role).toBe(1)
    expect(data.adminRole).toBe('super_admin')
  })

  it('test 3: token near expiry → refresh called, returns new accessToken + expiresAt', async () => {
    getMock.mockResolvedValue(makeSession({ accessTokenExpiresAt: NOW + 30_000 }))
    refreshMock.mockResolvedValue(
      makeSession({ accessToken: 'new-access-token', accessTokenExpiresAt: NOW + 10_800_000 }),
    )
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(refreshMock).toHaveBeenCalledOnce()
    expect(data.accessToken).toBe('new-access-token')
    expect(data.expiresAt).toBe(NOW + 10_800_000)
    expect(data.csrfToken).toBe('c'.repeat(43))
  })

  it('test 4a: near expiry + refresh throws UnauthenticatedError → 401', async () => {
    getMock.mockResolvedValue(makeSession({ accessTokenExpiresAt: NOW + 30_000 }))
    refreshMock.mockRejectedValue(new UnauthenticatedError('session expired'))
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('test 4b: near expiry + refresh throws BackendUpstreamError → 502', async () => {
    getMock.mockResolvedValue(makeSession({ accessTokenExpiresAt: NOW + 30_000 }))
    refreshMock.mockRejectedValue(new BackendUpstreamError('backend down'))
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('BACKEND_UPSTREAM_ERROR')
  })

  it('test 5: response always has Cache-Control: no-store, private', async () => {
    getMock.mockResolvedValue(makeSession())
    const res = await GET(getReq(), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })

  it('test 6: accessToken does not appear in any log output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getMock.mockResolvedValue(makeSession({ accessToken: 'secret-jwt-token' }))

    await GET(getReq(), noParams)

    const allLogged = [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join(' ')
    expect(allLogged).not.toContain('secret-jwt-token')

    logSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
