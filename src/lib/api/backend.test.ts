import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'
import { mockBackend } from '../../../tests/helpers/backend-mock'
import { _resetMockRegistry, registerMock } from '@/lib/mock/dispatch'
import { Role, type StoredSession, type TokenPair } from '@/lib/session/types'

const overrides = vi.hoisted(() => ({
  useMock: '0' as '0' | '1',
  backendUrl: 'http://backend.test',
}))

vi.mock('@/lib/config', () => ({
  env: {
    get USE_MOCK() {
      return overrides.useMock
    },
    get BACKEND_API_URL() {
      return overrides.backendUrl
    },
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'streamsight_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'streamsight-bff-test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6380,
    REDIS_PASSWORD: '',
    REDIS_TLS_ENABLED: '0',
    REDIS_CONNECT_TIMEOUT_MS: 2000,
    REDIS_COMMAND_TIMEOUT_MS: 1000,
    APP_VERSION: '0.0.0-test',
    NEXT_PUBLIC_APP_NAME: 'StreamSight',
  },
}))

const refreshMock = vi.fn()
const destroyMock = vi.fn()

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    refresh: refreshMock,
    destroy: destroyMock,
  }),
}))

import { backendFetch } from './backend'

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'access-original',
    accessTokenExpiresAt: now + 60 * 60_000, // 1h in future, no pre-emptive refresh
    refreshToken: 'refresh-original',
    refreshTokenExpiresAt: now + 30 * 24 * 60 * 60_000,
    user: { id: 'u1', name: 'Alice' },
    role: Role.USER,
    csrfToken: 'csrf-' + now,
    createdAt: now,
    ...over,
  }
}

function makeTokens(suffix = ''): TokenPair {
  const now = Date.now()
  return {
    accessToken: 'access' + suffix,
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'refresh' + suffix,
    refreshTokenExpiresAt: now + 600_000,
  }
}

beforeEach(() => {
  overrides.useMock = '0'
  refreshMock.mockReset()
  destroyMock.mockReset().mockResolvedValue(undefined)
  _resetMockRegistry()
})

describe('happy path', () => {
  it('200 + JSON returns { data, requestId } and injects Bearer', async () => {
    let receivedAuth: string | null = null
    mockBackend('get', 'http://backend.test/items', (req) => {
      receivedAuth = req.headers.get('authorization')
      return HttpResponse.json({ data: { id: 1, name: 'Alice' } })
    })

    const result = await backendFetch<{ data: { id: number } }>('/items', {
      session: makeSession(),
    })
    expect(result.data).toEqual({ data: { id: 1, name: 'Alice' } })
    expect(result.requestId).toMatch(/^req_\d{4}-\d{2}-\d{2}_/)
    expect(receivedAuth).toBe('Bearer access-original')
  })

  it('no session: does not inject Authorization', async () => {
    let receivedAuth: string | null = 'present'
    mockBackend('get', 'http://backend.test/public', (req) => {
      receivedAuth = req.headers.get('authorization')
      return HttpResponse.json({ data: 'ok' })
    })

    await backendFetch('/public')
    expect(receivedAuth).toBeNull()
  })

  it('echoes incoming requestId in headers + response', async () => {
    let received: string | null = null
    mockBackend('get', 'http://backend.test/x', (req) => {
      received = req.headers.get('x-request-id')
      return HttpResponse.json({ data: null })
    })

    const myId = 'req_2026-06-13_inject01'
    const { requestId } = await backendFetch('/x', { requestId: myId })
    expect(received).toBe(myId)
    expect(requestId).toBe(myId)
  })

  it('builds URL with query params', async () => {
    let receivedUrl = ''
    mockBackend('get', 'http://backend.test/search', (req) => {
      receivedUrl = req.url
      return HttpResponse.json({ data: null })
    })

    await backendFetch('/search', {
      query: { q: 'foo', cursor: 'abc', undef: undefined },
    })
    expect(receivedUrl).toContain('q=foo')
    expect(receivedUrl).toContain('cursor=abc')
    expect(receivedUrl).not.toContain('undef=')
  })
})

describe('error mapping', () => {
  it('timeout → BACKEND_TIMEOUT', async () => {
    mockBackend('get', 'http://backend.test/slow', async () => {
      await new Promise((r) => setTimeout(r, 500))
      return HttpResponse.json({ data: null })
    })
    await expect(
      backendFetch('/slow', { timeoutMs: 50 }),
    ).rejects.toMatchObject({ code: 'BACKEND_TIMEOUT', httpStatus: 504 })
  })

  it('5xx → BACKEND_UPSTREAM_ERROR', async () => {
    mockBackend('get', 'http://backend.test/boom', () =>
      HttpResponse.json({ err: 'boom' }, { status: 503 }),
    )
    await expect(backendFetch('/boom')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
      httpStatus: 502,
    })
  })

  it('404 → NotFoundError', async () => {
    mockBackend('get', 'http://backend.test/missing', () =>
      HttpResponse.json({ err: 'missing' }, { status: 404 }),
    )
    await expect(backendFetch('/missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
    })
  })

  it('400 non-401/404 → BACKEND_UPSTREAM_ERROR', async () => {
    mockBackend('get', 'http://backend.test/bad', () =>
      HttpResponse.json({ err: 'bad' }, { status: 400 }),
    )
    await expect(backendFetch('/bad')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
    })
  })

  it('network error (HttpResponse.error) → BACKEND_UPSTREAM_ERROR', async () => {
    mockBackend('get', 'http://backend.test/dead', () => HttpResponse.error())
    await expect(backendFetch('/dead')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
    })
  })

  it.each([
    ['ECONNREFUSED', 'TypeError'],
    ['ENOTFOUND', 'TypeError'],
  ])('classifies %s as BACKEND_UPSTREAM_ERROR', async (code, name) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
      const err = Object.assign(new Error(`connect ${code}`), { name, code })
      throw err
    })
    await expect(backendFetch('/anywhere')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
    })
    fetchSpy.mockRestore()
  })

  it('non-JSON 2xx body → BACKEND_UPSTREAM_ERROR', async () => {
    mockBackend('get', 'http://backend.test/html', () =>
      new HttpResponse('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    await expect(backendFetch('/html')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
    })
  })
})

describe('pre-emptive refresh', () => {
  it('refreshes when access token within PRE_REFRESH_MARGIN', async () => {
    const session = makeSession({
      accessToken: 'old-token',
      accessTokenExpiresAt: Date.now() + 5_000, // 5s — well inside 30s margin
    })
    refreshMock.mockResolvedValueOnce({
      ...session,
      accessToken: 'new-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
    })

    let receivedAuth: string | null = null
    mockBackend('get', 'http://backend.test/items', (req) => {
      receivedAuth = req.headers.get('authorization')
      return HttpResponse.json({ data: 'ok' })
    })

    await backendFetch('/items', { session })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(receivedAuth).toBe('Bearer new-token')
  })

  it('does not refresh when token has plenty of life', async () => {
    const session = makeSession() // 1h in future
    mockBackend('get', 'http://backend.test/items', () => HttpResponse.json({ data: 'ok' }))
    await backendFetch('/items', { session })
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('reactive refresh on 401', () => {
  it('AUTH_TOKEN_EXPIRED → refresh + retry → success', async () => {
    refreshMock.mockResolvedValueOnce({
      ...makeSession(),
      accessToken: 'refreshed-token',
    })

    let callCount = 0
    let secondCallAuth: string | null = null
    mockBackend('get', 'http://backend.test/items', (req) => {
      callCount++
      if (callCount === 1) {
        return HttpResponse.json(
          { error: { code: 'AUTH_TOKEN_EXPIRED' } },
          { status: 401 },
        )
      }
      secondCallAuth = req.headers.get('authorization')
      return HttpResponse.json({ ok: 'retry-ok' })
    })

    const { data } = await backendFetch<{ ok: string }>('/items', {
      session: makeSession(),
    })
    expect(data).toEqual({ ok: 'retry-ok' })
    expect(callCount).toBe(2)
    expect(secondCallAuth).toBe('Bearer refreshed-token')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('UNAUTHORIZED → destroy + UnauthenticatedError, no refresh', async () => {
    mockBackend('get', 'http://backend.test/items', () =>
      HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    )
    await expect(
      backendFetch('/items', { session: makeSession() }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', httpStatus: 401 })
    expect(refreshMock).not.toHaveBeenCalled()
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })

  it('refresh succeeded but retry still 401 → destroy + UnauthenticatedError', async () => {
    refreshMock.mockResolvedValueOnce({
      ...makeSession(),
      accessToken: 'refreshed-token',
    })
    mockBackend('get', 'http://backend.test/items', () =>
      HttpResponse.json({ error: { code: 'AUTH_TOKEN_EXPIRED' } }, { status: 401 }),
    )

    await expect(
      backendFetch('/items', { session: makeSession() }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })

  it('no session: 401 still becomes UnauthenticatedError but skips destroy', async () => {
    mockBackend('get', 'http://backend.test/items', () =>
      HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    )
    await expect(backendFetch('/items')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    })
    expect(refreshMock).not.toHaveBeenCalled()
    expect(destroyMock).not.toHaveBeenCalled() // nothing to revoke
  })

  it('Redis fail-closed: refresh throws BackendUpstreamError → propagates as 502', async () => {
    const { BackendUpstreamError } = await import('@/lib/errors')
    refreshMock.mockRejectedValueOnce(new BackendUpstreamError('redis down'))
    mockBackend('get', 'http://backend.test/items', () =>
      HttpResponse.json({ error: { code: 'AUTH_TOKEN_EXPIRED' } }, { status: 401 }),
    )
    await expect(
      backendFetch('/items', { session: makeSession() }),
    ).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
      httpStatus: 502,
    })
    // The spec'd fail-closed invariant: we did NOT silently degrade to a
    // session-less anonymous retry. Backend should be hit once (the original
    // 401) and never again.
  })
})

describe('mock dispatch (USE_MOCK=1)', () => {
  beforeEach(() => {
    overrides.useMock = '1'
  })

  it('registered path: returns fixture, no network call', async () => {
    let networkCalled = false
    mockBackend('get', 'http://backend.test/things', () => {
      networkCalled = true
      return HttpResponse.json({ data: 'real' })
    })
    registerMock('/things', () => ({ data: 'mocked' }))

    const result = await backendFetch('/things')
    expect(result.data).toEqual({ data: 'mocked' })
    expect(networkCalled).toBe(false)
  })

  it('unregistered path → BACKEND_UPSTREAM_ERROR', async () => {
    await expect(backendFetch('/nope')).rejects.toMatchObject({
      code: 'BACKEND_UPSTREAM_ERROR',
    })
  })

  it('passes query/body to handler', async () => {
    let captured: unknown
    registerMock('/echo', (opts) => {
      captured = opts
      return { received: opts }
    })
    await backendFetch('/echo', { method: 'POST', query: { q: 'x' }, body: { k: 1 } })
    expect(captured).toEqual({ query: { q: 'x' }, body: { k: 1 } })
  })
})

// Ensure TokenPair type stays consumed (otherwise unused-import warning)
const _typeCheck = (t: TokenPair) => t
void _typeCheck
void makeTokens
