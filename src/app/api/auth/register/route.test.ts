// Spec 007 v0.2 §7.2 — BFF route wiring tests.
//
// Pins the contract between FE client and BFF: body validation, two-leg
// backend flow (POST /auth/register → GET /auth/me), session creation,
// error code passthrough, and CSRF/Cache headers.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'

import { mockBackend } from '../../../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'

vi.mock('@/lib/config', () => ({
  env: {
    USE_MOCK: '0',
    BACKEND_API_URL: 'http://backend.test',
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'streamsight_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'streamsight-bff-test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_TLS_ENABLED: '0',
    REDIS_CONNECT_TIMEOUT_MS: 2000,
    REDIS_COMMAND_TIMEOUT_MS: 1000,
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

import { POST } from './route'

const VALID_BODY = { username: 'alice', password: 'hunter2hunter' }

// Hand-rolled JWT carrying role=0 (ADMIN) — BE 008 demo policy creates
// self-registered accounts as ADMIN; FE decodes the access token since
// BE /auth/me intentionally omits role (BE 008 §6.4).
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

const BE_REGISTER_OK = {
  accessToken: jwt({
    sub: '00000000-0000-4000-8000-000000000001',
    type: 'access',
    role: 0,
  }),
  accessExpiresIn: 900,
  refreshToken: 'refresh-token',
  refreshExpiresIn: 2592000,
  tokenType: 'Bearer',
}

const BE_ME_OK = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'alice',
  email: null,
  displayOrder: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  lastLoginAt: '2026-06-16T00:00:00.000Z',
  lastLoginType: 'PASSWORD',
}

const noParams = { params: Promise.resolve({}) }

function postReq(
  body: unknown,
  { origin = 'http://localhost:3000' }: { origin?: string } = {},
): Request {
  const headers = new Headers()
  headers.set('origin', origin)
  headers.set('content-type', 'application/json')
  const serialized = JSON.stringify(body)
  const bodyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(serialized))
      controller.close()
    },
  })
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/auth/register',
    headers,
    body: bodyStream,
  } as unknown as Request
}

/** Captured request bodies the BE mocks observed during a test. */
const capturedRegisterBody = { value: undefined as unknown }

function mockBackendOk(opts?: { meStatus?: number; meBody?: unknown }): void {
  mockBackend(
    'post',
    'http://backend.test/auth/register',
    async (req) => {
      capturedRegisterBody.value = await req.json()
      return HttpResponse.json(BE_REGISTER_OK, { status: 200 })
    },
  )
  mockBackend(
    'get',
    'http://backend.test/auth/me',
    async () =>
      HttpResponse.json(opts?.meBody ?? BE_ME_OK, {
        status: opts?.meStatus ?? 200,
      }),
  )
}

beforeEach(() => {
  _resetMockRegistry()
  createMock.mockClear()
  createMock.mockResolvedValue({
    sessionId: 's'.repeat(43),
    csrfToken: 'c'.repeat(43),
  })
  capturedRegisterBody.value = undefined
})

describe('POST /api/auth/register', () => {
  it('1: happy path → POST /auth/register + GET /auth/me + session created + 201 + Cache-Control', async () => {
    mockBackendOk()
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toMatch(/no-store/)

    expect(createMock).toHaveBeenCalledTimes(1)
    const arg = createMock.mock.calls[0][0] as {
      user: { id: string; name: string }
      tokens: { accessToken: string; accessTokenExpiresAt: number }
    }
    expect(arg.user.id).toBe(BE_ME_OK.id)
    expect(arg.user.name).toBe(BE_ME_OK.username)
    expect(arg.tokens.accessToken).toBe(BE_REGISTER_OK.accessToken)
    // accessExpiresIn 900 s → expiresAt about now+900s
    const now = Date.now()
    expect(arg.tokens.accessTokenExpiresAt).toBeGreaterThan(now)
    expect(arg.tokens.accessTokenExpiresAt).toBeLessThanOrEqual(now + 905_000)

    const body = (await res.json()) as {
      data: {
        sessionId: string
        csrfToken: string
        user: { id: string; name: string; email: string | null; role: number }
        expiresAt: number
      }
    }
    expect(body.data.sessionId).toBe('s'.repeat(43))
    expect(body.data.csrfToken).toBe('c'.repeat(43))
    expect(body.data.user).toEqual({
      id: BE_ME_OK.id,
      name: 'alice',
      email: null,
      role: 0, // BE 008 demo policy: self-register lands as ADMIN; FE decodes JWT
    })
    expect(body.data.expiresAt).toBeGreaterThan(now)
    // Spec 007 v0.4 — BFF stamps role:0 (ADMIN) when forwarding to BE so
    // self-registered accounts always land as admin in this demo project.
    expect(capturedRegisterBody.value).toMatchObject({ role: 0 })
  })

  it('2: body schema fail (username 太短) → 400 VALIDATION_ERROR、不打 backend', async () => {
    let beHit = false
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () => {
        beHit = true
        return HttpResponse.json(BE_REGISTER_OK, { status: 200 })
      },
    )
    const res = await POST(postReq({ username: 'ab', password: 'longenough' }), noParams)
    expect(res.status).toBe(400)
    expect(beHit).toBe(false)
  })

  it('3: backend 409 AUTH_USERNAME_TAKEN → BFF 透傳 409', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () =>
        HttpResponse.json(
          { error: { code: 'AUTH_USERNAME_TAKEN', message: 'taken' } },
          { status: 409 },
        ),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(409)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('4: backend 400 VALIDATION_FAILED → BFF 透傳 message', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'bad' } },
          { status: 400 },
        ),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('4b: backend 429 AUTH_RATE_LIMITED → BFF 透傳 429', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () =>
        HttpResponse.json(
          { error: { code: 'AUTH_RATE_LIMITED', message: 'slow down' } },
          { status: 429 },
        ),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(429)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('5: backend 5xx → BFF 502', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () => HttpResponse.json({ error: 'down' }, { status: 503 }),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('5b: register OK but /auth/me 500 → BFF 不建半套 session', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () => HttpResponse.json(BE_REGISTER_OK, { status: 200 }),
    )
    mockBackend(
      'get',
      'http://backend.test/auth/me',
      async () => HttpResponse.json({ error: 'oops' }, { status: 500 }),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('6: 跨來源 origin → 403 CSRF_INVALID（Origin 檢查）', async () => {
    mockBackendOk()
    const res = await POST(
      postReq(VALID_BODY, { origin: 'http://evil.example.com' }),
      noParams,
    )
    expect(res.status).toBe(403)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('7: BackendMeResponse 形狀不符 → BFF 5xx', async () => {
    mockBackend(
      'post',
      'http://backend.test/auth/register',
      async () => HttpResponse.json(BE_REGISTER_OK, { status: 200 }),
    )
    mockBackend(
      'get',
      'http://backend.test/auth/me',
      // 缺 id 欄位
      async () =>
        HttpResponse.json(
          { username: 'alice', email: null, createdAt: '2026-06-16' },
          { status: 200 },
        ),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(createMock).not.toHaveBeenCalled()
  })
})
