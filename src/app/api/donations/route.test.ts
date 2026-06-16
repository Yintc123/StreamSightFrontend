// Spec 002 §1.3 v0.8 — donation-project list per-viewport page limits.
//
// Wiring test: pins the actual values declared in route.ts (charity
// route.test.ts has the same pattern). Catches accidental edits like
// resetting tablet back to the mobile fallback.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'

import { mockBackend } from '../../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'

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

import { GET } from './route'

const noParams = { params: Promise.resolve({}) }

function getReq(path: string): Request {
  return {
    method: 'GET',
    url: new URL(path, 'http://localhost:3000').toString(),
    headers: new Headers(),
  } as Request
}

async function captureUpstreamLimit(viewport?: string): Promise<string | null> {
  let captured: string | null = null
  mockBackend(
    'get',
    'http://backend.test/user/v1/donation/donation-projects',
    async (req) => {
      captured = new URL(req.url).searchParams.get('limit')
      return HttpResponse.json({
        items: [],
        pageInfo: { nextCursor: null, hasMore: false },
      })
    },
  )
  const path = viewport
    ? `/api/donations?viewport=${viewport}`
    : '/api/donations'
  const res = await GET(getReq(path), noParams)
  expect(res.status).toBe(200)
  return captured
}

describe('GET /api/donations — viewport-aware page limits (spec 002 §1.3 v0.8)', () => {
  beforeEach(() => {
    _resetMockRegistry()
  })

  it('no viewport hint → mobile default 5 (16:9 cover card ≈ 半屏 × 5)', async () => {
    expect(await captureUpstreamLimit()).toBe('5')
  })

  it('viewport=mobile → 5', async () => {
    expect(await captureUpstreamLimit('mobile')).toBe('5')
  })

  it('viewport=tablet → 8 (md:grid-cols-2 × 4 rows)', async () => {
    expect(await captureUpstreamLimit('tablet')).toBe('8')
  })

  it('viewport=desktop → 5 (no desktopLimit override; falls back to mobile)', async () => {
    expect(await captureUpstreamLimit('desktop')).toBe('5')
  })
})
