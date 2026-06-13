import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import type { SessionStore } from '@/lib/session/store/types'
import type { StoredSession, TokenPair } from '@/lib/session/types'

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  const now = Date.now()
  return {
    userId: 'user-1',
    accessToken: 'at-' + now,
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt-' + now,
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'user-1', name: 'Alice' },
    csrfToken: 'csrf-' + now,
    createdAt: now,
    ...over,
  }
}

function makeTokens(): TokenPair {
  const now = Date.now()
  return {
    accessToken: 'at-' + now,
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt-' + now,
    refreshTokenExpiresAt: now + 600_000,
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Contract test runner. Every SessionStore impl must pass this same suite
 * (ADR 006 §10.1; spec 001b §8). Each test uses a unique id to avoid leaking
 * state between cases when the impl shares a backing Redis db.
 */
export function runSessionStoreContract(
  name: string,
  makeStore: () => Promise<SessionStore> | SessionStore,
) {
  describe(`SessionStore contract: ${name}`, () => {
    let store: SessionStore
    let suffix = 0
    const nextId = () => `${name}-${Date.now()}-${++suffix}`

    beforeAll(async () => {
      store = await makeStore()
    })

    afterAll(async () => {
      await store?.close()
    })

    describe('get / set / destroy', () => {
      it('set then get returns the stored session', async () => {
        const sid = nextId()
        const s = makeSession()
        await store.set(sid, s)
        expect(await store.get(sid)).toEqual(s)
      })

      it('get returns null for unknown sessionId', async () => {
        expect(await store.get(nextId())).toBeNull()
      })

      it('destroy then get returns null', async () => {
        const sid = nextId()
        await store.set(sid, makeSession())
        await store.destroy(sid)
        expect(await store.get(sid)).toBeNull()
      })

      it('destroy on unknown sessionId is idempotent (no throw)', async () => {
        await expect(store.destroy(nextId())).resolves.toBeUndefined()
      })

      it('set overwrites previous value', async () => {
        const sid = nextId()
        const a = makeSession({ csrfToken: 'first' })
        const b = makeSession({ csrfToken: 'second' })
        await store.set(sid, a)
        await store.set(sid, b)
        expect((await store.get(sid))?.csrfToken).toBe('second')
      })
    })

    describe('touch', () => {
      it('returns true for existing key and keeps it accessible', async () => {
        const sid = nextId()
        await store.set(sid, makeSession())
        expect(await store.touch(sid)).toBe(true)
        expect(await store.get(sid)).not.toBeNull()
      })

      it('returns false when key absent and does not create one', async () => {
        const sid = nextId()
        expect(await store.touch(sid)).toBe(false)
        expect(await store.get(sid)).toBeNull()
      })
    })

    describe('acquireLock / releaseLock', () => {
      it('first acquire returns a token string', async () => {
        const tok = await store.acquireLock(nextId(), 1000)
        expect(typeof tok).toBe('string')
        expect((tok ?? '').length).toBeGreaterThan(0)
      })

      it('second acquire on held key returns null', async () => {
        const key = nextId()
        const t1 = await store.acquireLock(key, 1000)
        const t2 = await store.acquireLock(key, 1000)
        expect(t1).toBeTruthy()
        expect(t2).toBeNull()
      })

      it('lock auto-expires when ttl elapses', async () => {
        const key = nextId()
        const t1 = await store.acquireLock(key, 150)
        expect(t1).toBeTruthy()
        await sleep(220)
        const t2 = await store.acquireLock(key, 1000)
        expect(t2).toBeTruthy()
      })

      it('releaseLock with correct token releases the lock', async () => {
        const key = nextId()
        const tok = await store.acquireLock(key, 5000)
        expect(tok).toBeTruthy()
        await store.releaseLock(key, tok!)
        const tok2 = await store.acquireLock(key, 1000)
        expect(tok2).toBeTruthy()
      })

      it('releaseLock with wrong token does not release the lock', async () => {
        const key = nextId()
        const tok = await store.acquireLock(key, 5000)
        expect(tok).toBeTruthy()
        await store.releaseLock(key, 'wrong-token')
        const tok2 = await store.acquireLock(key, 1000)
        expect(tok2).toBeNull()
      })
    })

    describe('getCachedTokens / setCachedTokens', () => {
      it('returns null when never set', async () => {
        expect(await store.getCachedTokens(nextId())).toBeNull()
      })

      it('round-trips a TokenPair', async () => {
        const userId = nextId()
        const tokens = makeTokens()
        await store.setCachedTokens(userId, tokens, 1000)
        expect(await store.getCachedTokens(userId)).toEqual(tokens)
      })

      it('returns null after ttl elapses', async () => {
        const userId = nextId()
        await store.setCachedTokens(userId, makeTokens(), 150)
        await sleep(220)
        expect(await store.getCachedTokens(userId)).toBeNull()
      })
    })

    describe('ping', () => {
      it('returns true when connection healthy', async () => {
        expect(await store.ping()).toBe(true)
      })
    })
  })
}
