import { test, expect } from '@playwright/test'

/**
 * BFF route smoke tests. Exercised via the dev server started by playwright's
 * webServer (USE_MOCK=1, real iron-session, real Redis). Catches "I broke a
 * route handler" before it hits user-facing e2e flows.
 */

test('GET /api/health/live returns 200 + status:ok', async ({ request }) => {
  const res = await request.get('/api/health/live')
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('no-store, private')
  expect(await res.json()).toEqual({ data: { status: 'ok' } })
})

test('GET /api/health (readiness) returns 200 when Redis ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = (await res.json()) as {
    data: { status: string; deps: { redis: string } }
  }
  expect(body.data.status).toBe('ok')
  expect(body.data.deps.redis).toBe('ok')
})

test('GET /api/csrf without session returns 401 UNAUTHENTICATED', async ({ request }) => {
  const res = await request.get('/api/csrf')
  expect(res.status()).toBe(401)
  const body = (await res.json()) as { error: { code: string } }
  expect(body.error.code).toBe('UNAUTHENTICATED')
})

test('dev-login → csrf round-trip with cookie', async ({ request }) => {
  // POST /api/dev/login is csrfExempt and dev-only; should succeed and set
  // an iron-session cookie.
  const login = await request.post('/api/dev/login', {
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  })
  expect(login.status()).toBe(200)
  const loginBody = (await login.json()) as {
    data: { sessionId: string; csrfToken: string; user: { id: string } }
  }
  expect(loginBody.data.sessionId).toHaveLength(43)
  expect(loginBody.data.csrfToken).toHaveLength(43)

  // Subsequent /api/csrf should now return the same token (session bound).
  const csrf = await request.get('/api/csrf')
  expect(csrf.status()).toBe(200)
  const csrfBody = (await csrf.json()) as { data: { csrfToken: string } }
  expect(csrfBody.data.csrfToken).toBe(loginBody.data.csrfToken)
})
