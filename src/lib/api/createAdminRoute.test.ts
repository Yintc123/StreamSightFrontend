import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { Role, type StoredSession } from '@/lib/session/types'

const sessionGet = vi.fn<() => Promise<StoredSession | null>>()
const sessionTouch = vi.fn(async () => {})
const sessionMutated = vi.fn(() => false)
vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: sessionGet,
    touch: sessionTouch,
    wasMutated: sessionMutated,
  }),
}))

import { createAdminRoute } from './createAdminRoute'

function adminSession(): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'u1', name: 'Alice' },
    role: Role.ADMIN,
    csrfToken: 'a'.repeat(43),
    createdAt: now,
  }
}

// Hand-roll a Request-shaped object (matches create-route.test.ts pattern).
// `Origin` is on fetch's forbidden-header list, so `new Request({headers:{origin}})`
// silently strips it — verifyCsrf would then 403 with Invalid origin.
function jsonReq(method: string, body?: unknown, csrfToken?: string): Request {
  const headers = new Headers({ origin: 'http://localhost:3000' })
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  const stream =
    body === undefined
      ? null
      : new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(JSON.stringify(body)))
            c.close()
          },
        })
  return {
    method,
    url: 'http://localhost:3000/api/cms/charities',
    headers,
    body: stream,
  } as unknown as Request
}

beforeEach(() => {
  sessionGet.mockReset()
  sessionTouch.mockClear()
  sessionMutated.mockReset()
  sessionMutated.mockReturnValue(false)
})

describe('createAdminRoute', () => {
  it('no session → 401 UNAUTHENTICATED（via createRoute requireAuth）', async () => {
    sessionGet.mockResolvedValue(null)
    const route = createAdminRoute({ handler: async () => new Response('ok') })
    const res = await route(jsonReq('GET'), { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('non-admin role → 403 FORBIDDEN', async () => {
    sessionGet.mockResolvedValue({ ...adminSession(), role: Role.USER })
    const route = createAdminRoute({ handler: async () => new Response('ok') })
    const res = await route(jsonReq('GET'), { params: Promise.resolve({}) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('admin role → handler 被叫 + session 不為 null', async () => {
    sessionGet.mockResolvedValue(adminSession())
    let received: { session: StoredSession } | undefined
    const handler = async (args: { session: StoredSession }) => {
      received = args
      return new Response('"ok"', {
        headers: { 'content-type': 'application/json' },
      })
    }
    const route = createAdminRoute({ handler })
    const res = await route(jsonReq('GET'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(received).toBeDefined()
    expect(received!.session.role).toBe(Role.ADMIN)
  })

  it('admin + bodySchema → body 自動 Zod parse', async () => {
    sessionGet.mockResolvedValue(adminSession())
    const bodySchema = z.object({ name: z.string().min(1) })
    let receivedBody: unknown
    const route = createAdminRoute({
      bodySchema,
      handler: async ({ body }) => {
        receivedBody = body
        return new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    // POST 需要 csrfToken 跟 session 對得起來；用同一個 session 物件
    const session = adminSession()
    sessionGet.mockResolvedValue(session)
    const req = jsonReq('POST', { name: 'X' }, session.csrfToken)
    const res = await route(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(receivedBody).toEqual({ name: 'X' })
  })
})
