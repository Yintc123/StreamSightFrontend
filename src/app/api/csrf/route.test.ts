import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredSession } from '@/lib/session/types'

const state = vi.hoisted(() => ({
  session: null as StoredSession | null,
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockImplementation(async () => state.session),
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => false,
  }),
}))

import { GET } from './route'

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'u1', name: 'Alice' },
    csrfToken: 'csrf-' + 'a'.repeat(38),
    createdAt: now,
    ...over,
  }
}

function getReq(): Request {
  return { method: 'GET', url: 'http://localhost:3000/api/csrf', headers: new Headers() } as Request
}

const noParams = { params: Promise.resolve({}) }

beforeEach(() => {
  state.session = null
})

describe('GET /api/csrf', () => {
  it('returns 401 UNAUTHENTICATED when no session', async () => {
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('returns 200 with csrfToken when session present', async () => {
    state.session = makeSession({ csrfToken: 'token-' + 'a'.repeat(37) })
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.csrfToken).toBe('token-' + 'a'.repeat(37))
  })

  it('always sets Cache-Control: no-store, private', async () => {
    state.session = makeSession()
    const res = await GET(getReq(), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})
