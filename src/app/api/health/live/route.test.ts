import { describe, it, expect, vi } from 'vitest'

const pingMock = vi.fn().mockRejectedValue(new Error('should not be called'))

vi.mock('@/lib/session/store', () => ({
  getSessionStore: () => ({ ping: pingMock }),
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockResolvedValue(null),
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => false,
  }),
}))

import { GET } from './route'

const noParams = { params: Promise.resolve({}) }

function getReq(): Request {
  return {
    method: 'GET',
    url: 'http://localhost:3000/api/health/live',
    headers: new Headers(),
  } as Request
}

describe('GET /api/health/live (liveness)', () => {
  it('always returns 200 + status:ok without touching the store', async () => {
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('ok')
    expect(pingMock).not.toHaveBeenCalled()
  })

  it('sets Cache-Control: no-store, private', async () => {
    const res = await GET(getReq(), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})
