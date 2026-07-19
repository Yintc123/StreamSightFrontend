import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'
import { Role, type StoredSession } from '@/lib/session/types'

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

const overrides = vi.hoisted(() => ({ session: null as StoredSession | null }))
const touchMock = vi.fn().mockResolvedValue(undefined)
const destroyMock = vi.fn().mockResolvedValue(undefined)
const getMock = vi.fn()

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: getMock,
    touch: touchMock,
    destroy: destroyMock,
    refresh: vi.fn(),
    wasMutated: () => true,
  }),
}))

import { mockBackend } from '../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'
import {
  adminListRoute,
  adminCreateRoute,
  adminDetailRoute,
  adminRenameRoute,
  adminDeleteRoute,
  adminRoleRoute,
  makeLifecyclePost,
  cmsMeRoute,
  cmsMePasswordRoute,
} from './admin-routes'

const CSRF = 'csrf-token-' + 'a'.repeat(32)

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  const now = Date.now()
  return {
    userId: 'principal-1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60 * 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'principal-1', name: 'Root' },
    role: Role.ADMIN,
    adminRole: 'super_admin',
    csrfToken: CSRF,
    createdAt: now,
    ...over,
  }
}

function req(method: string, body?: unknown): Request {
  const headers = new Headers()
  headers.set('origin', 'http://localhost:3000')
  // Any non-safe method needs the CSRF token (even bodyless DELETE/POST).
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', CSRF)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return {
    method,
    url: 'http://localhost:3000/api/cms/admins',
    headers,
    body:
      body === undefined
        ? null
        : new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode(JSON.stringify(body)))
              c.close()
            },
          }),
  } as unknown as Request
}

function ctx(id?: string): { params: Promise<Record<string, string>> } {
  const params: Record<string, string> = id ? { id } : {}
  return { params: Promise.resolve(params) }
}

// Backend wire fixture — admin_role is the int rank (enum-int.md).
const SUMMARY = {
  id: 2,
  username: 'editor1',
  name: 'Editor One',
  admin_role: 50,
  is_protected: false,
  is_active: true,
  archived_at: null,
  archived_by: null,
  archived_by_username: null,
  deleted_at: null,
  deleted_by: null,
  deleted_by_username: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
}

beforeEach(() => {
  _resetMockRegistry()
  overrides.session = makeSession()
  touchMock.mockClear()
  destroyMock.mockClear().mockResolvedValue(undefined)
  getMock.mockReset().mockImplementation(async () => overrides.session)
})

describe('GET /api/cms/admins (list)', () => {
  it('passes status/limit/offset through and returns adapted envelope', async () => {
    let receivedUrl = ''
    mockBackend('get', 'http://backend.test/admin/admins', (r) => {
      receivedUrl = r.url
      return HttpResponse.json({ items: [SUMMARY], total: 1, limit: 25, offset: 5 })
    })
    const request = {
      method: 'GET',
      url: 'http://localhost:3000/api/cms/admins?status=archived&limit=25&offset=5',
      headers: new Headers({ origin: 'http://localhost:3000' }),
      body: null,
    } as unknown as Request
    const res = await adminListRoute(request, ctx())
    expect(res.status).toBe(200)
    expect(receivedUrl).toContain('status=archived')
    expect(receivedUrl).toContain('limit=25')
    expect(receivedUrl).toContain('offset=5')
    const body = await res.json()
    expect(body.data.total).toBe(1)
    expect(body.data.items[0].adminRole).toBe('editor')
    expect(body.data.items[0].isProtected).toBe(false)
  })

  it('viewer (non-super) → 403', async () => {
    overrides.session = makeSession({ adminRole: 'viewer' })
    const request = {
      method: 'GET',
      url: 'http://localhost:3000/api/cms/admins',
      headers: new Headers({ origin: 'http://localhost:3000' }),
      body: null,
    } as unknown as Request
    const res = await adminListRoute(request, ctx())
    expect(res.status).toBe(403)
  })
})

describe('POST /api/cms/admins (create)', () => {
  it('maps camel→snake, returns 201 + adapted response', async () => {
    let sentBody: unknown
    mockBackend('post', 'http://backend.test/admin/admins', async (r) => {
      sentBody = await r.json()
      return HttpResponse.json(
        { id: 100, username: 'jane', name: 'Jane', admin_role: 0 },
        { status: 201 },
      )
    })
    const res = await adminCreateRoute(
      req('POST', { username: 'jane', name: 'Jane', password: 'secret12', adminRole: 'viewer' }),
      ctx(),
    )
    expect(res.status).toBe(201)
    expect(sentBody).toEqual({ username: 'jane', name: 'Jane', password: 'secret12', admin_role: 0 })
    const body = await res.json()
    expect(body.data).toEqual({ id: 100, username: 'jane', name: 'Jane', adminRole: 'viewer' })
  })

  it('409 conflict passes through as 409', async () => {
    mockBackend('post', 'http://backend.test/admin/admins', () =>
      HttpResponse.json({ error: 'conflict', message: '帳號已被使用' }, { status: 409 }),
    )
    const res = await adminCreateRoute(
      req('POST', { username: 'dup', name: 'Dup', password: 'secret12' }),
      ctx(),
    )
    expect(res.status).toBe(409)
  })

  it('short password rejected by Zod → 400 (no backend call)', async () => {
    let called = false
    mockBackend('post', 'http://backend.test/admin/admins', () => {
      called = true
      return HttpResponse.json({}, { status: 201 })
    })
    const res = await adminCreateRoute(
      req('POST', { username: 'jane', name: 'Jane', password: 'short' }),
      ctx(),
    )
    expect(res.status).toBe(400)
    expect(called).toBe(false)
  })
})

describe('GET/PATCH/DELETE /api/cms/admins/[id]', () => {
  it('GET detail → adapted summary', async () => {
    mockBackend('get', 'http://backend.test/admin/admins/2', () => HttpResponse.json(SUMMARY))
    const res = await adminDetailRoute(req('GET'), ctx('2'))
    expect(res.status).toBe(200)
    expect((await res.json()).data.username).toBe('editor1')
  })

  it('PATCH rename sends {name}, returns adapted response', async () => {
    let sent: unknown
    mockBackend('patch', 'http://backend.test/admin/admins/2', async (r) => {
      sent = await r.json()
      return HttpResponse.json({ id: 2, username: 'editor1', name: 'Renamed', admin_role: 50 })
    })
    const res = await adminRenameRoute(req('PATCH', { name: 'Renamed' }), ctx('2'))
    expect(res.status).toBe(200)
    expect(sent).toEqual({ name: 'Renamed' })
    expect((await res.json()).data.name).toBe('Renamed')
  })

  it('DELETE (soft) → adapted summary', async () => {
    mockBackend('delete', 'http://backend.test/admin/admins/2', () =>
      HttpResponse.json({ ...SUMMARY, is_active: false, deleted_at: '2026-07-11T00:00:00Z' }),
    )
    const res = await adminDeleteRoute(req('DELETE'), ctx('2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.isActive).toBe(false)
    expect(body.data.deletedAt).toBe('2026-07-11T00:00:00Z')
  })

  it('invalid id (non-numeric) → 400', async () => {
    const res = await adminDetailRoute(req('GET'), ctx('abc'))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/cms/admins/[id]/role', () => {
  it('sends {admin_role}, returns adapted response', async () => {
    let sent: unknown
    mockBackend('put', 'http://backend.test/admin/admins/2/role', async (r) => {
      sent = await r.json()
      return HttpResponse.json({ id: 2, username: 'editor1', name: 'Editor One', admin_role: 100 })
    })
    const res = await adminRoleRoute(req('PUT', { adminRole: 'super_admin' }), ctx('2'))
    expect(res.status).toBe(200)
    expect(sent).toEqual({ admin_role: 100 })
    expect((await res.json()).data.adminRole).toBe('super_admin')
  })

  it('422 business rule (e.g. self-promote / protected) passes through', async () => {
    mockBackend('put', 'http://backend.test/admin/admins/1/role', () =>
      HttpResponse.json({ error: 'business_rule_violation', message: 'cannot modify root' }, { status: 422 }),
    )
    const res = await adminRoleRoute(req('PUT', { adminRole: 'editor' }), ctx('1'))
    expect(res.status).toBe(422)
  })
})

describe('lifecycle POST actions', () => {
  it.each(['archive', 'unarchive', 'restore'] as const)(
    '%s hits the matching upstream path and returns a summary',
    async (action) => {
      let hit = false
      mockBackend('post', `http://backend.test/admin/admins/2/${action}`, () => {
        hit = true
        return HttpResponse.json(SUMMARY)
      })
      const res = await makeLifecyclePost(action)(req('POST', {}), ctx('2'))
      expect(res.status).toBe(200)
      expect(hit).toBe(true)
      expect((await res.json()).data.id).toBe(2)
    },
  )
})

describe('/api/cms/me (self-service)', () => {
  it('GET returns own id — open to a viewer admin (not super)', async () => {
    overrides.session = makeSession({ adminRole: 'viewer' })
    mockBackend('get', 'http://backend.test/admin/me', () =>
      HttpResponse.json({ id: 9, username: 'viewer1', name: 'Viewer', admin_role: 0 }),
    )
    const res = await cmsMeRoute(req('GET'), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ id: 9, username: 'viewer1', name: 'Viewer', adminRole: 'viewer' })
  })

  it('POST /me/password → 204, sends snake body, destroys session', async () => {
    let sent: unknown
    mockBackend('post', 'http://backend.test/admin/me/password', async (r) => {
      sent = await r.json()
      return new HttpResponse(null, { status: 204 })
    })
    const res = await cmsMePasswordRoute(
      req('POST', { currentPassword: 'oldpw', newPassword: 'newsecret' }),
      ctx(),
    )
    expect(res.status).toBe(204)
    expect(sent).toEqual({ current_password: 'oldpw', new_password: 'newsecret' })
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })

  it('POST /me/password wrong old password → 400 passthrough, no destroy', async () => {
    mockBackend('post', 'http://backend.test/admin/me/password', () =>
      HttpResponse.json({ error: 'bad_request', message: '密碼錯誤' }, { status: 400 }),
    )
    const res = await cmsMePasswordRoute(
      req('POST', { currentPassword: 'wrong', newPassword: 'newsecret' }),
      ctx(),
    )
    expect(res.status).toBe(400)
    expect(destroyMock).not.toHaveBeenCalled()
  })
})
