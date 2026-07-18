import { describe, it, expect, vi, beforeEach } from 'vitest'

// The store selection reads `env` and constructs one of the two store
// classes. Mock both classes so the test never opens a real Redis socket,
// and mock config so each case can set REDIS_HOST / USE_MOCK independently.

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
  vi.resetModules()
  const { getSessionStore } = await import('./index')
  return getSessionStore() as unknown as { kind: string }
}

beforeEach(() => {
  overrides.USE_MOCK = '1'
  overrides.REDIS_HOST = undefined
})

describe('getSessionStore selection', () => {
  it('REDIS_HOST unset → in-memory', async () => {
    overrides.REDIS_HOST = undefined
    expect((await pick()).kind).toBe('memory')
  })

  it('REDIS_HOST set → Redis, even under USE_MOCK=1 (store choice is decoupled from mock backend)', async () => {
    overrides.USE_MOCK = '1'
    overrides.REDIS_HOST = 'localhost'
    expect((await pick()).kind).toBe('redis')
  })

  it('REDIS_HOST set + USE_MOCK=0 → Redis', async () => {
    overrides.USE_MOCK = '0'
    overrides.REDIS_HOST = 'redis.internal'
    expect((await pick()).kind).toBe('redis')
  })

  it('memoises the instance per module load', async () => {
    overrides.REDIS_HOST = 'localhost'
    vi.resetModules()
    const { getSessionStore } = await import('./index')
    expect(getSessionStore()).toBe(getSessionStore())
  })
})
