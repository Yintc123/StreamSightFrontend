import { describe, it, expect, beforeEach, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pingResult: true as boolean | Error,
}))

vi.mock('@/lib/session/store', () => ({
  getSessionStore: () => ({
    ping: vi.fn().mockImplementation(async () => {
      if (state.pingResult instanceof Error) throw state.pingResult
      return state.pingResult
    }),
  }),
}))

// Session service is unused but createRoute will call it. Stub session=null.
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
    url: 'http://localhost:3000/api/health',
    headers: new Headers(),
  } as Request
}

beforeEach(() => {
  state.pingResult = true
})

describe('GET /api/health (readiness)', () => {
  it('returns 200 + status:ok + deps.redis:ok when Redis ping passes', async () => {
    state.pingResult = true
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('ok')
    expect(body.data.deps.redis).toBe('ok')
    expect(typeof body.data.uptime).toBe('number')
    expect(body.data.version).toBe('0.0.0-test')
  })

  it('returns 503 degraded when Redis ping returns false', async () => {
    state.pingResult = false
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.data.status).toBe('degraded')
    expect(body.data.deps.redis).toBe('down')
  })

  it('returns 503 degraded when Redis ping throws', async () => {
    state.pingResult = new Error('redis exploded')
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.data.status).toBe('degraded')
  })

  it('does not leak backend URL / secret / stack in body', async () => {
    state.pingResult = new Error('redis exploded\n  at internal/redis/url=secret')
    const res = await GET(getReq(), noParams)
    const raw = await res.text()
    expect(raw).not.toContain('secret')
    expect(raw).not.toContain('at internal')
  })

  it('sets Cache-Control: no-store, private', async () => {
    const res = await GET(getReq(), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})
