// Spec 004 / spec 017 — createDetailRoute factory contract.
//
// Detail endpoint = `GET /api/<resource>/:id`. Pinning:
//
//   1. Forwards `Accept-Language` from inbound client → upstream so
//      backend i18n picks the right locale.
//   2. Upstream URL composes `{upstream}/{id}` cleanly (no trailing `//`).
//   3. `:id` must be uuid v4 — bad input → 400 BEFORE hitting upstream.
//   4. Upstream 404 surfaces as 404 to the client (not 502) — RSC pages
//      call `notFound()` on it. spec 017 §2 cascading-visibility 404
//      flips with no warning, so the BFF cannot silently turn it into
//      "internal".
//   5. Upstream response is Zod-validated; drift → 502
//      ContractViolationError.
//   6. Mapper drops backend-only fields before the response envelope.
//   7. Cache-Control: no-store, private from createRoute (cascading
//      visibility means 404 → 200 can flip — never let intermediaries
//      cache a stale 404).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'
import { z } from 'zod'

import { mockBackend } from '../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'

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
    SESSION_COOKIE_NAME: 'jko_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'jko-bff-test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6380,
    REDIS_PASSWORD: '',
    REDIS_TLS_ENABLED: '0',
    REDIS_CONNECT_TIMEOUT_MS: 2000,
    REDIS_COMMAND_TIMEOUT_MS: 1000,
    APP_VERSION: '0.0.0-test',
    ENABLE_DEV_LOGIN: '1',
    NEXT_PUBLIC_APP_NAME: 'JKODonation',
  },
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockResolvedValue(null),
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => false,
  }),
}))

import { createDetailRoute } from './createDetailRoute'

const BackendForTest = z.object({
  id: z.string().uuid(),
  name: z.string(),
})

type ClientShape = { id: string; name: string }

const route = createDetailRoute({
  upstream: '/user/v1/donation/charities',
  backendSchema: BackendForTest,
  toClient: (b): ClientShape => ({ id: b.id, name: b.name }),
})

const VALID_UUID = '11111111-1111-4111-8111-000000000001'

function getReq(
  path: string,
  extraHeaders: Record<string, string> = {},
): Request {
  const url = new URL(path, 'http://localhost:3000')
  return {
    method: 'GET',
    url: url.toString(),
    headers: new Headers(extraHeaders),
  } as Request
}

function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  _resetMockRegistry()
  overrides.useMock = '0'
})

describe('createDetailRoute — happy path', () => {
  it('composes upstream URL as `{base}/{id}` and forwards Accept-Language', async () => {
    let captured: { path: string; lang: string | null } = { path: '', lang: null }
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async (req) => {
        captured = {
          path: new URL(req.url).pathname,
          lang: req.headers.get('accept-language'),
        }
        return HttpResponse.json({ id: VALID_UUID, name: 'ACC' })
      },
    )

    const res = await route(
      getReq(`/api/charities/${VALID_UUID}`, { 'accept-language': 'en' }),
      ctxFor(VALID_UUID),
    )
    expect(res.status).toBe(200)
    expect(captured.path).toBe(`/user/v1/donation/charities/${VALID_UUID}`)
    expect(captured.lang).toBe('en')
  })

  it('strips backend-only fields via the mapper', async () => {
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async () =>
        HttpResponse.json({
          id: VALID_UUID,
          name: 'ACC',
          extraNoise: 'should be ignored',
        }),
    )
    const res = await route(getReq(`/api/charities/${VALID_UUID}`), ctxFor(VALID_UUID))
    const body = (await res.json()) as { data: ClientShape }
    expect(body.data).toEqual({ id: VALID_UUID, name: 'ACC' })
    expect(body.data).not.toHaveProperty('extraNoise')
  })
})

describe('createDetailRoute — :id validation', () => {
  it('rejects a non-uuid :id with 400 BEFORE hitting backend', async () => {
    let backendCalled = false
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities/not-a-uuid',
      async () => {
        backendCalled = true
        return HttpResponse.json({})
      },
    )
    const res = await route(getReq('/api/charities/not-a-uuid'), ctxFor('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(backendCalled).toBe(false)
  })
})

describe('createDetailRoute — error propagation', () => {
  it('upstream 404 → 404 to client (NOT 502)', async () => {
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async () =>
        HttpResponse.json(
          {
            code: 'CHARITY_NOT_FOUND',
            title: 'Not Found',
            status: 404,
          },
          { status: 404 },
        ),
    )
    const res = await route(getReq(`/api/charities/${VALID_UUID}`), ctxFor(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('upstream 500 → 502 to client', async () => {
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async () => HttpResponse.text('boom', { status: 500 }),
    )
    const res = await route(getReq(`/api/charities/${VALID_UUID}`), ctxFor(VALID_UUID))
    expect(res.status).toBe(502)
  })

  it('upstream schema drift → 502 ContractViolationError', async () => {
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async () =>
        HttpResponse.json({
          // `name` missing — fails BackendForTest
          id: VALID_UUID,
        }),
    )
    const res = await route(getReq(`/api/charities/${VALID_UUID}`), ctxFor(VALID_UUID))
    expect(res.status).toBe(502)
  })
})

describe('createDetailRoute — response headers', () => {
  it('Cache-Control: no-store, private (inherited from createRoute)', async () => {
    mockBackend(
      'get',
      `http://backend.test/user/v1/donation/charities/${VALID_UUID}`,
      async () => HttpResponse.json({ id: VALID_UUID, name: 'ACC' }),
    )
    const res = await route(getReq(`/api/charities/${VALID_UUID}`), ctxFor(VALID_UUID))
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})
