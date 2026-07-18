import { describe, it, expect, vi, beforeEach } from 'vitest'

// The store selection reads `env` and constructs one of the two store
// classes. Mock both classes so the test never opens a real Redis socket,
// and mock config so each case can set USE_MOCK / REDIS_HOST independently.

const overrides = vi.hoisted(() => ({
  USE_MOCK: '1' as '0' | '1',
  REDIS_HOST: undefined as string | undefined,
}))

vi.mock('@/lib/config', () => ({
  env: {
    get USE_MOCK() {
      return overrides.USE_MOCK
    },
    get REDIS_HOST() {
      return overrides.REDIS_HOST
    },
  },
}))

class FakeInMemory {
  kind = 'memory'
}
class FakeRedis {
  kind = 'redis'
}
vi.mock('./in-memory', () => ({ InMemorySessionStore: FakeInMemory }))
vi.mock('./redis', () => ({ RedisSessionStore: FakeRedis }))

async function pick() {
  // globalThis memoisation persists across resetModules, so clear it first.
  delete (globalThis as { __sessionStore?: unknown }).__sessionStore
  vi.resetModules()
  const { getSessionStore } = await import('./index')
  return getSessionStore() as unknown as { kind: string }
}

beforeEach(() => {
  overrides.USE_MOCK = '1'
  overrides.REDIS_HOST = undefined
})

describe('getSessionStore selection', () => {
  it('USE_MOCK=1 → in-memory, even when REDIS_HOST is set (mock = fully self-contained)', async () => {
    overrides.USE_MOCK = '1'
    overrides.REDIS_HOST = 'localhost'
    expect((await pick()).kind).toBe('memory')
  })

  it('USE_MOCK=0 + REDIS_HOST set → Redis', async () => {
    overrides.USE_MOCK = '0'
    overrides.REDIS_HOST = 'redis.internal'
    expect((await pick()).kind).toBe('redis')
  })

  it('USE_MOCK=0 without REDIS_HOST → in-memory fallback', async () => {
    overrides.USE_MOCK = '0'
    overrides.REDIS_HOST = undefined
    expect((await pick()).kind).toBe('memory')
  })

  it('memoises on globalThis so all module graphs share one instance', async () => {
    delete (globalThis as { __sessionStore?: unknown }).__sessionStore
    vi.resetModules()
    const { getSessionStore } = await import('./index')
    const first = getSessionStore()
    // A fresh module import (as a different Turbopack graph would do) must
    // return the SAME instance via globalThis, not a new one.
    vi.resetModules()
    const { getSessionStore: getAgain } = await import('./index')
    expect(getAgain()).toBe(first)
  })
})
