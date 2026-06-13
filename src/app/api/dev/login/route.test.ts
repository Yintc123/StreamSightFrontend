import { describe, it, expect, beforeEach, vi } from 'vitest'

const overrides = vi.hoisted(() => ({
  nodeEnv: 'test' as 'development' | 'test' | 'production',
  enableDevLogin: '1' as '0' | '1',
}))

vi.mock('@/lib/config', () => ({
  env: {
    get NODE_ENV() {
      return overrides.nodeEnv
    },
    get ENABLE_DEV_LOGIN() {
      return overrides.enableDevLogin
    },
    USE_MOCK: '1',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'jko_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'jko-bff-test',
    APP_VERSION: '0.0.0-test',
    NEXT_PUBLIC_APP_NAME: 'JKODonation',
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
    wasMutated: () => true, // create mutates
  }),
}))

import { POST } from './route'

const noParams = { params: Promise.resolve({}) }

function postReq(origin = 'http://localhost:3000'): Request {
  const headers = new Headers()
  headers.set('origin', origin)
  headers.set('content-type', 'application/json')
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/dev/login',
    headers,
    body: null,
  } as unknown as Request
}

beforeEach(() => {
  overrides.nodeEnv = 'test'
  overrides.enableDevLogin = '1'
  createMock.mockClear().mockResolvedValue({
    sessionId: 's'.repeat(43),
    csrfToken: 'c'.repeat(43),
  })
})

describe('POST /api/dev/login', () => {
  it('production + ENABLE_DEV_LOGIN=0 → 404', async () => {
    overrides.nodeEnv = 'production'
    overrides.enableDevLogin = '0'
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(404)
  })

  it('development + ENABLE_DEV_LOGIN=0 → 404', async () => {
    overrides.nodeEnv = 'development'
    overrides.enableDevLogin = '0'
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(404)
  })

  it('development + ENABLE_DEV_LOGIN=1 → 200 + session payload', async () => {
    overrides.nodeEnv = 'development'
    overrides.enableDevLogin = '1'
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.sessionId).toHaveLength(43)
    expect(body.data.csrfToken).toHaveLength(43)
    expect(body.data.user).toBeDefined()
    expect(typeof body.data.expiresAt).toBe('number')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('csrfExempt: POST without X-CSRF-Token still passes', async () => {
    overrides.nodeEnv = 'development'
    overrides.enableDevLogin = '1'
    // No X-CSRF-Token header set
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(200)
  })

  it('foreign Origin → 403 CSRF_INVALID (csrfExempt does not bypass origin)', async () => {
    overrides.nodeEnv = 'development'
    overrides.enableDevLogin = '1'
    const res = await POST(postReq('http://evil.com'), noParams)
    expect(res.status).toBe(403)
  })

  it('passes ttl values that match ADR 004 (3h access, 30d refresh)', async () => {
    overrides.nodeEnv = 'development'
    overrides.enableDevLogin = '1'
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    const { tokens } = args as {
      tokens: {
        accessTokenExpiresAt: number
        refreshTokenExpiresAt: number
      }
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
