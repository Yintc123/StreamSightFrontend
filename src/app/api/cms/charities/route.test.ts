// Spec 011a §7.4 — BFF /api/cms/charities (POST + GET list) integration tests.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'
import { Role, type StoredSession } from '@/lib/session/types'

const overrides = vi.hoisted(() => ({
  session: null as StoredSession | null,
}))

vi.mock('@/lib/config', () => ({
  env: {
    USE_MOCK: '0',
    BACKEND_API_URL: 'http://backend.test',
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'jko_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'jko-bff-test',
    APP_VERSION: '0.0.0-test',
    ENABLE_DEV_LOGIN: '1',
    NEXT_PUBLIC_APP_NAME: 'JKODonation',
  },
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockImplementation(async () => overrides.session),
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => false,
  }),
}))

import { mockBackend } from '../../../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'
import { POST, GET } from './route'

function adminSession(): StoredSession {
  const now = Date.now()
  return {
    userId: 'admin-1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'admin-1', name: 'Admin' },
    role: Role.ADMIN,
    csrfToken: 'c'.repeat(43),
    createdAt: now,
  }
}

function userSession(): StoredSession {
  return { ...adminSession(), role: Role.USER }
}

function postReq(body: unknown, csrfToken?: string): Request {
  const headers = new Headers({
    origin: 'http://localhost:3000',
    'content-type': 'application/json',
  })
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(JSON.stringify(body)))
      c.close()
    },
  })
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/cms/charities',
    headers,
    body: stream,
  } as unknown as Request
}

function getReq(qs = ''): Request {
  return {
    method: 'GET',
    url: `http://localhost:3000/api/cms/charities${qs ? `?${qs}` : ''}`,
    headers: new Headers(),
    body: null,
  } as unknown as Request
}

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'
const CATEGORY_ID = '00000000-0000-4000-8000-0000000000aa'

const VALID_BODY = {
  name: '中華耆幼關懷協會',
  description: '提供長者與兒少之雙世代福利服務',
  displayOrder: 0,
  categoryIds: [],
}

const FULL_DETAIL_RESPONSE = {
  id: CHARITY_ID,
  name: '中華耆幼關懷協會',
  description: '提供長者與兒少之雙世代福利服務',
  logoUrl: null,
  contactPhone: null,
  contactEmail: null,
  officialWebsite: null,
  approvalNo: null,
  categories: [],
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  displayOrder: 0,
  publishStartAt: null,
  publishEndAt: null,
  archivedAt: null,
  deletedAt: null,
}

const noParams = { params: Promise.resolve({}) }

beforeEach(() => {
  _resetMockRegistry()
  overrides.session = null
})

describe('POST /api/cms/charities', () => {
  it('no session → 401 UNAUTHENTICATED', async () => {
    overrides.session = null
    const session = adminSession()
    const res = await POST(postReq(VALID_BODY, session.csrfToken), noParams)
    expect(res.status).toBe(401)
  })

  it('non-admin → 403 FORBIDDEN', async () => {
    overrides.session = userSession()
    const res = await POST(postReq(VALID_BODY, userSession().csrfToken), noParams)
    expect(res.status).toBe(403)
  })

  it('admin + invalid body (name empty) → 400', async () => {
    overrides.session = adminSession()
    const bad = { ...VALID_BODY, name: '' }
    const res = await POST(postReq(bad, adminSession().csrfToken), noParams)
    expect(res.status).toBe(400)
  })

  it('admin + valid body → forward POST /cms/donation/charities + passthrough public response', async () => {
    overrides.session = adminSession()
    let receivedBody: unknown
    // BE actually returns the *public* CharityDetail shape on POST (no
    // admin lifecycle fields). The BFF passes through verbatim.
    const publicResp = {
      id: CHARITY_ID,
      name: '中華耆幼關懷協會',
      description: '描述',
      logoUrl: null,
      contactPhone: null,
      contactEmail: null,
      officialWebsite: null,
      approvalNo: null,
      categories: [],
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    }
    mockBackend(
      'post',
      'http://backend.test/cms/donation/charities',
      async (req) => {
        receivedBody = await req.json()
        return HttpResponse.json(publicResp, { status: 201 })
      },
    )
    const session = adminSession()
    overrides.session = session
    const res = await POST(postReq(VALID_BODY, session.csrfToken), noParams)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof publicResp }
    expect(body.data.id).toBe(CHARITY_ID)
    expect(receivedBody).toMatchObject({ name: '中華耆幼關懷協會' })
  })

  it('admin + publishEnd <= publishStart → 400 (refine)', async () => {
    overrides.session = adminSession()
    const bad = {
      ...VALID_BODY,
      publishStartAt: '2026-06-16T00:00:00.000Z',
      publishEndAt: '2026-06-16T00:00:00.000Z',
    }
    const res = await POST(postReq(bad, adminSession().csrfToken), noParams)
    expect(res.status).toBe(400)
  })

  it('admin + categoryIds full payload → forward 通過', async () => {
    overrides.session = adminSession()
    mockBackend('post', 'http://backend.test/cms/donation/charities', async () =>
      HttpResponse.json(FULL_DETAIL_RESPONSE, { status: 201 }),
    )
    const session = adminSession()
    overrides.session = session
    const res = await POST(
      postReq({ ...VALID_BODY, categoryIds: [CATEGORY_ID] }, session.csrfToken),
      noParams,
    )
    expect(res.status).toBe(200)
  })
})

describe('GET /api/cms/charities', () => {
  it('no session → 401', async () => {
    overrides.session = null
    const res = await GET(getReq(), noParams)
    expect(res.status).toBe(401)
  })

  it('admin → forward /cms/donation/charities', async () => {
    overrides.session = adminSession()
    let receivedUrl: string | undefined
    mockBackend('get', 'http://backend.test/cms/donation/charities', (req) => {
      receivedUrl = req.url
      return HttpResponse.json({ items: [], nextCursor: null }, { status: 200 })
    })
    const res = await GET(getReq('limit=50'), noParams)
    expect(res.status).toBe(200)
    expect(receivedUrl).toContain('/cms/donation/charities')
    expect(receivedUrl).toContain('limit=50')
  })

  it('admin + requested limit > 100 → cap at 100 (admin endpoint max)', async () => {
    overrides.session = adminSession()
    let receivedUrl: string | undefined
    mockBackend('get', 'http://backend.test/cms/donation/charities', (req) => {
      receivedUrl = req.url
      return HttpResponse.json({ items: [], nextCursor: null }, { status: 200 })
    })
    const res = await GET(getReq('limit=999'), noParams)
    expect(res.status).toBe(200)
    expect(receivedUrl).toContain('limit=100')
  })

  it('admin + includeArchived flag → forwarded', async () => {
    overrides.session = adminSession()
    let receivedUrl: string | undefined
    mockBackend('get', 'http://backend.test/cms/donation/charities', (req) => {
      receivedUrl = req.url
      return HttpResponse.json({ items: [], nextCursor: null }, { status: 200 })
    })
    const res = await GET(getReq('includeArchived=true'), noParams)
    expect(res.status).toBe(200)
    expect(receivedUrl).toContain('includeArchived=true')
  })
})
