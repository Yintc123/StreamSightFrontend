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
import { Role } from '@/lib/session/types'
import { POST } from './route'

const noParams = { params: Promise.resolve({}) }

const DEFAULT_BODY = { identifier: 'admin', password: 'admin-dev-password-change-me' }

// JWT `sub` is the principal_id (a stringified int); `/admin/me.id` is the
// admin child PK, a DIFFERENT int (spec 012a §2.7). We assert the session
// binds to `sub`, never to me.id.
const SUB = '42'
const ADMIN_CHILD_ID = 7

function bodyStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

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

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

let loginRequestBody: Record<string, unknown> | null = null

function stubBeAuth(
  opts: { roleInJwt?: 0 | 1; grade?: string; adminRole?: string } = {},
) {
  const { roleInJwt = 1, grade = 'super_admin', adminRole = 'super_admin' } = opts
  loginRequestBody = null
  mockBackend('post', 'http://backend.test/admin/auth/login', async (req) => {
    loginRequestBody = (await req.json()) as Record<string, unknown>
    return HttpResponse.json(
      {
        access_token: jwt({ sub: SUB, type: 'access', role: roleInJwt, grade }),
        token_type: 'bearer',
        refresh_token: 'opaque-refresh-token',
        expires_in: 1800,
      },
      { status: 200 },
    )
  })
  mockBackend('get', 'http://backend.test/admin/me', () =>
    HttpResponse.json(
      { id: ADMIN_CHILD_ID, username: 'admin', name: 'Root Admin', admin_role: adminRole },
      { status: 200 },
    ),
  )
}

beforeEach(() => {
  _resetMockRegistry()
  loginRequestBody = null
  createMock.mockClear().mockResolvedValue({
    sessionId: 's'.repeat(43),
    csrfToken: 'c'.repeat(43),
  })
})

describe('POST /api/auth/login', () => {
  it('happy path → /admin/auth/login + /admin/me → admin session + 200', async () => {
    stubBeAuth()
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.sessionId).toHaveLength(43)
    expect(body.data.csrfToken).toHaveLength(43)
    // userId / user.id come from JWT sub (principal_id), not /admin/me.id.
    expect(body.data.user.id).toBe(SUB)
    expect(body.data.user.name).toBe('Root Admin')
    expect(createMock).toHaveBeenCalledTimes(1)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(Role.ADMIN)
    expect((args as { user: { id: string } }).user.id).toBe(SUB)
  })

  it('maps BFF identifier → backend username', async () => {
    stubBeAuth()
    await POST(postReq({ identifier: 'root', password: 'pw' }), noParams)
    expect(loginRequestBody).toEqual({ username: 'root', password: 'pw' })
  })

  it('stores adminRole from /admin/me.admin_role', async () => {
    stubBeAuth({ adminRole: 'editor' })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    expect((args as { adminRole?: string }).adminRole).toBe('editor')
  })

  it('JWT role=1 → ADMIN', async () => {
    stubBeAuth({ roleInJwt: 1 })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(Role.ADMIN)
  })

  it('JWT role=0 → USER (fail-safe, not promoted)', async () => {
    // /admin/me still returns an admin_role, but the JWT role claim governs
    // the principal type. role=0 must resolve to USER.
    stubBeAuth({ roleInJwt: 0 })
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    expect((args as { role: number }).role).toBe(Role.USER)
  })

  it('access ttl from expires_in; refresh ttl from 14d fallback', async () => {
    stubBeAuth()
    await POST(postReq(), noParams)
    const [args] = createMock.mock.calls[0]
    const { tokens } = args as {
      tokens: { accessTokenExpiresAt: number; refreshTokenExpiresAt: number }
    }
    const now = Date.now()
    const accessTtl = tokens.accessTokenExpiresAt - now
    const refreshTtl = tokens.refreshTokenExpiresAt - now
    expect(accessTtl).toBeGreaterThan(1800_000 - 1000)
    expect(accessTtl).toBeLessThan(1800_000 + 1000)
    expect(refreshTtl).toBeGreaterThan(14 * 24 * 60 * 60_000 - 1000)
    expect(refreshTtl).toBeLessThan(14 * 24 * 60 * 60_000 + 1000)
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

  it('bad credentials → backend 401 surfaces as 401', async () => {
    mockBackend('post', 'http://backend.test/admin/auth/login', () =>
      HttpResponse.json(
        { error: 'unauthorized', message: '帳號或密碼錯誤' },
        { status: 401 },
      ),
    )
    const res = await POST(postReq(), noParams)
    expect(res.status).toBe(401)
  })
})
