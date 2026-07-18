import { describe, it, expect, vi, beforeEach } from 'vitest'

const baseEnv = {
  NODE_ENV: 'test' as const,
  USE_MOCK: '0' as const,
  BACKEND_API_URL: 'http://backend.test',
  SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
  SESSION_COOKIE_NAME: 'streamsight_session',
  SESSION_TTL_SECONDS: 2_592_000,
  ALLOWED_ORIGINS: 'http://localhost:3000',
  REDIS_KEY_PREFIX: 'streamsight-bff-test',
  APP_VERSION: '0.0.0-test',
  NEXT_PUBLIC_APP_NAME: 'StreamSight',
}

describe('sessionOptions — SESSION_COOKIE_DOMAIN (spec 015 §1.1)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('test 12: SESSION_COOKIE_DOMAIN not set → cookieOptions has no domain field', async () => {
    vi.doMock('@/lib/config', () => ({
      env: { ...baseEnv, SESSION_COOKIE_DOMAIN: undefined },
    }))
    const { sessionOptions } = await import('./config')
    expect(sessionOptions.cookieOptions).not.toHaveProperty('domain')
  })

  it('test 13: SESSION_COOKIE_DOMAIN=".example.com" → cookieOptions.domain === ".example.com"', async () => {
    vi.doMock('@/lib/config', () => ({
      env: { ...baseEnv, SESSION_COOKIE_DOMAIN: '.example.com' },
    }))
    const { sessionOptions } = await import('./config')
    expect((sessionOptions.cookieOptions as Record<string, unknown>).domain).toBe('.example.com')
  })
})
