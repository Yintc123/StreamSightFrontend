import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const REAL_ENV = {
  NODE_ENV: 'test',
  BACKEND_API_URL: 'http://localhost:3001',
  USE_MOCK: '0',
  SESSION_SECRET: 'a'.repeat(32),
  SESSION_COOKIE_NAME: 'jko_session',
  SESSION_TTL_SECONDS: '2592000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  REDIS_URL: 'redis://localhost:6379',
  REDIS_KEY_PREFIX: 'jko-bff',
  REDIS_TLS_ENABLED: '0',
  REDIS_CONNECT_TIMEOUT_MS: '2000',
  REDIS_COMMAND_TIMEOUT_MS: '1000',
  APP_VERSION: '0.0.0',
  ENABLE_DEV_LOGIN: '0',
  NEXT_PUBLIC_APP_NAME: 'JKODonation',
}

/**
 * config.ts parses process.env at import time. Each test stubs env vars,
 * resets the module cache, then dynamically imports to trigger fresh parse.
 */
async function loadConfig(overrides: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = { ...REAL_ENV, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
  // Remove keys that should be deleted entirely (passed as undefined)
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      vi.stubEnv(key, '')
      delete process.env[key]
    }
  }
  vi.resetModules()
  return await import('./config')
}

describe('config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses a full valid env', async () => {
    const { env } = await loadConfig({})
    expect(env.BACKEND_API_URL).toBe('http://localhost:3001')
    expect(env.USE_MOCK).toBe('0')
    expect(env.SESSION_COOKIE_NAME).toBe('jko_session')
    expect(env.SESSION_TTL_SECONDS).toBe(2_592_000)
    expect(env.REDIS_KEY_PREFIX).toBe('jko-bff')
  })

  it('USE_MOCK=1 allows missing BACKEND_API_URL / REDIS_URL (but not SESSION_SECRET)', async () => {
    const { env } = await loadConfig({
      USE_MOCK: '1',
      BACKEND_API_URL: undefined,
      REDIS_URL: undefined,
    })
    expect(env.USE_MOCK).toBe('1')
    expect(env.BACKEND_API_URL).toBeUndefined()
    expect(env.REDIS_URL).toBeUndefined()
    // SESSION_SECRET is unconditionally required — iron-session cookie path
    // runs in mock mode too. See config.ts comment.
    expect(env.SESSION_SECRET).toHaveLength(32)
  })

  it('USE_MOCK=0 + missing BACKEND_API_URL → throws', async () => {
    await expect(
      loadConfig({ USE_MOCK: '0', BACKEND_API_URL: undefined }),
    ).rejects.toThrow(/BACKEND_API_URL/)
  })

  it('Missing SESSION_SECRET → throws regardless of USE_MOCK', async () => {
    await expect(
      loadConfig({ USE_MOCK: '1', SESSION_SECRET: undefined }),
    ).rejects.toThrow(/SESSION_SECRET/)
    await expect(
      loadConfig({ USE_MOCK: '0', SESSION_SECRET: undefined }),
    ).rejects.toThrow(/SESSION_SECRET/)
  })

  it('USE_MOCK=0 + missing REDIS_URL → throws', async () => {
    await expect(
      loadConfig({ USE_MOCK: '0', REDIS_URL: undefined }),
    ).rejects.toThrow(/REDIS_URL/)
  })

  it('production + empty ALLOWED_ORIGINS → throws', async () => {
    await expect(
      loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: '' }),
    ).rejects.toThrow(/ALLOWED_ORIGINS/)
  })

  it('production + only localhost in ALLOWED_ORIGINS → throws', async () => {
    await expect(
      loadConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:4000',
      }),
    ).rejects.toThrow(/ALLOWED_ORIGINS/)
  })

  it('production + ENABLE_DEV_LOGIN=1 → throws', async () => {
    await expect(
      loadConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://example.com',
        ENABLE_DEV_LOGIN: '1',
      }),
    ).rejects.toThrow(/ENABLE_DEV_LOGIN/)
  })

  it('SESSION_SECRET < 32 chars → throws', async () => {
    await expect(
      loadConfig({ SESSION_SECRET: 'tooshort' }),
    ).rejects.toThrow()
  })

  it('SESSION_SECRET_PREVIOUS is optional', async () => {
    const { env } = await loadConfig({})
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined()
  })

  it('SESSION_SECRET_PREVIOUS when provided must be ≥ 32 chars', async () => {
    await expect(
      loadConfig({ SESSION_SECRET_PREVIOUS: 'too-short' }),
    ).rejects.toThrow()
    const { env } = await loadConfig({
      SESSION_SECRET_PREVIOUS: 'b'.repeat(32),
    })
    expect(env.SESSION_SECRET_PREVIOUS).toHaveLength(32)
  })
})
