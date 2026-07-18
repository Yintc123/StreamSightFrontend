import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const REAL_ENV = {
  NODE_ENV: 'test',
  BACKEND_API_URL: 'http://localhost:3001',
  USE_MOCK: '0',
  SESSION_SECRET: 'a'.repeat(32),
  SESSION_COOKIE_NAME: 'streamsight_session',
  SESSION_TTL_SECONDS: '2592000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
  REDIS_KEY_PREFIX: 'streamsight-bff',
  REDIS_TLS_ENABLED: '0',
  REDIS_CONNECT_TIMEOUT_MS: '2000',
  REDIS_COMMAND_TIMEOUT_MS: '1000',
  APP_VERSION: '0.0.0',
  NEXT_PUBLIC_APP_NAME: 'StreamSight',
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
    expect(env.SESSION_COOKIE_NAME).toBe('streamsight_session')
    expect(env.SESSION_TTL_SECONDS).toBe(2_592_000)
    expect(env.REDIS_KEY_PREFIX).toBe('streamsight-bff')
  })

  it('USE_MOCK=1 allows missing BACKEND_API_URL / REDIS_HOST (but not SESSION_SECRET)', async () => {
    const { env } = await loadConfig({
      USE_MOCK: '1',
      BACKEND_API_URL: undefined,
      REDIS_HOST: undefined,
    })
    expect(env.USE_MOCK).toBe('1')
    expect(env.BACKEND_API_URL).toBeUndefined()
    expect(env.REDIS_HOST).toBeUndefined()
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

  it('USE_MOCK=0 + missing REDIS_HOST → throws', async () => {
    await expect(
      loadConfig({ USE_MOCK: '0', REDIS_HOST: undefined }),
    ).rejects.toThrow(/REDIS_HOST/)
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

  it('STREAMLIT_BASE_URL is optional', async () => {
    const { env } = await loadConfig({})
    expect(env.STREAMLIT_BASE_URL).toBeUndefined()
  })

  it('STREAMLIT_BASE_URL when provided must be a valid URL', async () => {
    await expect(
      loadConfig({ STREAMLIT_BASE_URL: 'not-a-url' }),
    ).rejects.toThrow(/STREAMLIT_BASE_URL/)
    const { env } = await loadConfig({
      STREAMLIT_BASE_URL: 'https://app.streamsight.example',
    })
    expect(env.STREAMLIT_BASE_URL).toBe('https://app.streamsight.example')
  })
})
