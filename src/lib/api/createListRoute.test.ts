// Spec 002 §2 — `createListRoute` factory.
//
// Generic Route-Handler factory for the three list endpoints (charities /
// donations / items). Behaviour pinned by this test:
//
//   1. Forwards `q`, `cursor`, `category` to the upstream URL (limit
//      defaults to 10, overridable per route via `opts.limit` — spec 002
//      §1.3 v0.3) and forwards `Accept-Language`.
//   2. Validates the upstream response against the supplied backend-item
//      schema; mismatch → 502-shaped ContractViolationError.
//   3. Maps inflated `categories: [{id, key, displayName}]` from backend
//      down to `string[]` of keys for the client (spec 002 §3.2 client
//      contract). Strips `createdAt` / `updatedAt`. Null `logoUrl` /
//      `coverImageUrl` are dropped from the response (client schema uses
//      `optional()`, not `nullable()` — drop-on-empty matches that).
//   4. Returns `{ data: { items, nextCursor } }` envelope. `Cache-Control:
//      no-store, private` is enforced by the underlying createRoute.
//   5. Invalid query (e.g. unknown `category`) → 400 ValidationError, no
//      upstream call.
//
// Implementation detail kept out of these tests: which spec 016 endpoint
// each route file targets — that's wired per-route in
// app/api/{charities,donations,items}/route.ts.

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

import { createListRoute } from './createListRoute'

// Minimal backend list-item schema for these tests — doesn't need to mirror
// any real entity. Inflated categories follow the spec 016 v0.13 shape.
const BackendItemForTest = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  categories: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      displayName: z.string(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
})

type ClientItem = {
  id: string
  name: string
  description: string
  logoUrl?: string
  categories: string[]
}

const route = createListRoute({
  upstream: '/user/v1/donation/charities',
  backendItemSchema: BackendItemForTest,
  toClientItem: (b): ClientItem => ({
    id: b.id,
    name: b.name,
    description: b.description,
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    categories: b.categories.map((c) => c.key),
  }),
})

const noParams = { params: Promise.resolve({}) }

function getReq(path: string, extraHeaders: Record<string, string> = {}): Request {
  const url = new URL(path, 'http://localhost:3000')
  return {
    method: 'GET',
    url: url.toString(),
    headers: new Headers(extraHeaders),
  } as Request
}

beforeEach(() => {
  _resetMockRegistry()
  overrides.useMock = '0'
})

describe('createListRoute — happy path', () => {
  it('forwards q, cursor, category, limit=10 and Accept-Language to the upstream', async () => {
    let capturedUrl: URL | undefined
    let capturedLang: string | null = null
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async (req) => {
        capturedUrl = new URL(req.url)
        capturedLang = req.headers.get('accept-language')
        return HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        })
      },
    )

    const res = await route(
      getReq('/api/charities?q=acc&cursor=abc&category=child_care', {
        'accept-language': 'en',
      }),
      noParams,
    )
    expect(res.status).toBe(200)
    expect(capturedUrl?.searchParams.get('q')).toBe('acc')
    expect(capturedUrl?.searchParams.get('cursor')).toBe('abc')
    expect(capturedUrl?.searchParams.get('category')).toBe('child_care')
    expect(capturedUrl?.searchParams.get('limit')).toBe('10')
    expect(capturedLang).toBe('en')
  })

  it('maps inflated categories → string[] of keys, strips createdAt/updatedAt', async () => {
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () =>
        HttpResponse.json({
          items: [
            {
              id: '11111111-1111-4111-8111-000000000001',
              name: 'ACC',
              description: 'desc',
              logoUrl: 'https://cdn.example.com/acc.png',
              categories: [
                { id: 'cat-1', key: 'child_care', displayName: '兒少照護' },
                { id: 'cat-2', key: 'elderly_care', displayName: '老人照護' },
              ],
              createdAt: '2026-06-14T01:23:45.678Z',
              updatedAt: '2026-06-14T01:23:45.678Z',
            },
          ],
          pageInfo: { nextCursor: 'next-cursor', hasMore: true },
        }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { items: ClientItem[]; nextCursor: string | null } }
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]).toEqual({
      id: '11111111-1111-4111-8111-000000000001',
      name: 'ACC',
      description: 'desc',
      logoUrl: 'https://cdn.example.com/acc.png',
      categories: ['child_care', 'elderly_care'],
    })
    expect(body.data.nextCursor).toBe('next-cursor')
  })

  it('drops null logoUrl from the output (client schema uses optional, not nullable)', async () => {
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () =>
        HttpResponse.json({
          items: [
            {
              id: '11111111-1111-4111-8111-000000000002',
              name: 'No-logo',
              description: 'd',
              logoUrl: null,
              categories: [],
              createdAt: '2026-06-14T01:23:45.678Z',
              updatedAt: '2026-06-14T01:23:45.678Z',
            },
          ],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    const body = (await res.json()) as { data: { items: ClientItem[] } }
    expect(body.data.items[0]).not.toHaveProperty('logoUrl')
  })

  it('opts.tabletLimit / desktopLimit kick in per query.viewport', async () => {
    // Spec 002 §1.3 v0.6 — item tab: limit:4 / tabletLimit:6 / desktopLimit:12.
    const route = createListRoute({
      upstream: '/user/v1/donation/sale-items',
      backendItemSchema: BackendItemForTest,
      toClientItem: (b): ClientItem => ({
        id: b.id,
        name: b.name,
        description: b.description,
        categories: [],
      }),
      limit: 4,
      tabletLimit: 6,
      desktopLimit: 12,
    })
    const captured: string[] = []
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/sale-items',
      async (req) => {
        captured.push(new URL(req.url).searchParams.get('limit') ?? '')
        return HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        })
      },
    )
    await route(getReq('/api/items'), noParams) // no viewport → mobile default
    await route(getReq('/api/items?viewport=mobile'), noParams)
    await route(getReq('/api/items?viewport=tablet'), noParams)
    await route(getReq('/api/items?viewport=desktop'), noParams)
    expect(captured).toEqual(['4', '4', '6', '12'])
  })

  it('viewport=tablet without opts.tabletLimit → falls back to limit', async () => {
    const route = createListRoute({
      upstream: '/user/v1/donation/charities',
      backendItemSchema: BackendItemForTest,
      toClientItem: (b): ClientItem => ({
        id: b.id,
        name: b.name,
        description: b.description,
        categories: [],
      }),
      limit: 10, // no tabletLimit / desktopLimit set
    })
    let captured: string | null = null
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async (req) => {
        captured = new URL(req.url).searchParams.get('limit')
        return HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        })
      },
    )
    await route(getReq('/api/charities?viewport=tablet'), noParams)
    expect(captured).toBe('10')
  })

  it('per-route opts.limit overrides the default 10', async () => {
    // Spec 002 §1.3 v0.3 — donation tab uses limit=5, item tab limit=4.
    const routeWithLimit = createListRoute({
      upstream: '/user/v1/donation/donation-projects',
      backendItemSchema: BackendItemForTest,
      toClientItem: (b): ClientItem => ({
        id: b.id,
        name: b.name,
        description: b.description,
        categories: [],
      }),
      limit: 5,
    })
    let capturedUrl: URL | undefined
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/donation-projects',
      async (req) => {
        capturedUrl = new URL(req.url)
        return HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        })
      },
    )
    const res = await routeWithLimit(getReq('/api/donations'), noParams)
    expect(res.status).toBe(200)
    expect(capturedUrl?.searchParams.get('limit')).toBe('5')
  })

  it('returns nextCursor=null on the last page', async () => {
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () =>
        HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    const body = (await res.json()) as { data: { nextCursor: string | null } }
    expect(body.data.nextCursor).toBeNull()
  })
})

describe('createListRoute — query validation', () => {
  it('rejects an unknown category with 400 before hitting backend', async () => {
    let backendCalled = false
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () => {
        backendCalled = true
        return HttpResponse.json({})
      },
    )
    const res = await route(getReq('/api/charities?category=animals'), noParams)
    expect(res.status).toBe(400)
    expect(backendCalled).toBe(false)
  })

  it('rejects q > 80 chars with 400', async () => {
    let backendCalled = false
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () => {
        backendCalled = true
        return HttpResponse.json({})
      },
    )
    const longQ = 'a'.repeat(81)
    const res = await route(
      getReq(`/api/charities?q=${longQ}`),
      noParams,
    )
    expect(res.status).toBe(400)
    expect(backendCalled).toBe(false)
  })
})

describe('createListRoute — upstream failure modes', () => {
  it('502-equivalent (BackendUpstreamError) when upstream returns 500', async () => {
    mockBackend('get', 'http://backend.test/user/v1/donation/charities', async () =>
      HttpResponse.text('boom', { status: 500 }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    expect(res.status).toBe(502)
  })

  it('502 when upstream response shape violates the schema (ContractViolationError)', async () => {
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () =>
        HttpResponse.json({
          // Missing required `categories` field → fails BackendItemForTest.
          items: [
            {
              id: '11111111-1111-4111-8111-000000000003',
              name: 'broken',
              description: 'd',
              logoUrl: null,
              createdAt: '2026-06-14T01:23:45.678Z',
              updatedAt: '2026-06-14T01:23:45.678Z',
            },
          ],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    expect(res.status).toBe(502)
  })
})

describe('createListRoute — response headers', () => {
  it('enforces Cache-Control: no-store, private', async () => {
    mockBackend(
      'get',
      'http://backend.test/user/v1/donation/charities',
      async () =>
        HttpResponse.json({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false },
        }),
    )
    const res = await route(getReq('/api/charities'), noParams)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
  })
})
