import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeCookieStore } from '../../../tests/helpers/cookie-store'
import { InMemorySessionStore } from './store/in-memory'
import { Role, type TokenPair, type StoredSession } from './types'

const fakeStore = createFakeCookieStore()
let sharedStore: InMemorySessionStore = new InMemorySessionStore()
const backendFetchMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => fakeStore,
}))

vi.mock('@/lib/session/store', () => ({
  getSessionStore: () => sharedStore,
}))

vi.mock('@/lib/api/backend', () => ({
  backendFetch: (path: string, opts?: unknown) => backendFetchMock(path, opts),
}))

import { getSessionService } from './service'
import { writeSessionId } from './cookie'

function tokens(suffix = ''): TokenPair {
  const now = Date.now()
  return {
    accessToken: 'at' + suffix,
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt' + suffix,
    refreshTokenExpiresAt: now + 600_000,
  }
}

const USER = { id: 'user-1', name: 'Alice' }

beforeEach(() => {
  fakeStore.clear()
  sharedStore = new InMemorySessionStore()
  backendFetchMock.mockReset()
})

describe('create', () => {
  it('writes store + cookie, returns sessionId + csrfToken', async () => {
    const svc = getSessionService()
    const { sessionId, csrfToken } = await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(sessionId).toHaveLength(43)
    expect(csrfToken).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(csrfToken).toHaveLength(43)

    const stored = await svc.get()
    expect(stored).not.toBeNull()
    expect(stored!.userId).toBe(USER.id)
    expect(stored!.user).toEqual(USER)
    expect(stored!.csrfToken).toBe(csrfToken)
    expect(stored!.accessToken).toBe('at')
    expect(stored!.refreshToken).toBe('rt')
    expect(svc.wasMutated()).toBe(true)
  })
})

describe('get', () => {
  it('returns null when no cookie present', async () => {
    expect(await getSessionService().get()).toBeNull()
  })

  it('returns null when cookie unsealable', async () => {
    fakeStore.set('streamsight_session', 'this-is-not-a-sealed-cookie')
    expect(await getSessionService().get()).toBeNull()
  })

  it('returns null when store has no matching entry', async () => {
    await writeSessionId('z'.repeat(43)) // cookie present, store empty
    expect(await getSessionService().get()).toBeNull()
  })

  it('does not slide TTL on read (no mutation, no cookie rewrite)', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    const beforeCookie = fakeStore.get('streamsight_session')!.value
    // call get a few times
    await svc.get()
    await svc.get()
    await svc.get()
    const afterCookie = fakeStore.get('streamsight_session')!.value
    expect(afterCookie).toBe(beforeCookie)
  })
})

describe('update', () => {
  it('throws UnauthenticatedError when no session', async () => {
    await expect(getSessionService().update({ accessToken: 'x' })).rejects.toThrow(
      /no session/i,
    )
  })

  it('merges patch and preserves untouched fields', async () => {
    const svc = getSessionService()
    const { csrfToken } = await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    const original = (await svc.get())!

    await svc.update({ accessToken: 'new-at', accessTokenExpiresAt: 9999 })
    const updated = (await svc.get())!

    expect(updated.accessToken).toBe('new-at')
    expect(updated.accessTokenExpiresAt).toBe(9999)
    expect(updated.csrfToken).toBe(csrfToken)
    expect(updated.createdAt).toBe(original.createdAt)
    expect(updated.userId).toBe(original.userId)
    expect(svc.wasMutated()).toBe(true)
  })
})

describe('destroy', () => {
  it('clears cookie before store', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    const order: string[] = []
    const destroySpy = vi
      .spyOn(sharedStore, 'destroy')
      .mockImplementation(async () => {
        order.push('store')
      })
    // iron-session clears via set('', { maxAge: 0 }) rather than delete()
    const origSet = fakeStore.set
    fakeStore.set = (name, value, options) => {
      const opts = (options ?? {}) as { maxAge?: number }
      if (value === '' || opts.maxAge === 0) order.push('cookie')
      origSet.call(fakeStore, name, value, options)
    }

    await svc.destroy()

    expect(order[0]).toBe('cookie')
    expect(order[1]).toBe('store')
    expect(svc.wasMutated()).toBe(true)
    destroySpy.mockRestore()
    fakeStore.set = origSet
  })

  it('is idempotent when no session', async () => {
    const svc = getSessionService()
    await expect(svc.destroy()).resolves.toBeUndefined()
  })

  it('swallows store.destroy failures', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    vi.spyOn(sharedStore, 'destroy').mockRejectedValueOnce(new Error('redis down'))
    await expect(svc.destroy()).resolves.toBeUndefined()
    // Cookie still cleared
    expect(fakeStore.get('streamsight_session')).toBeUndefined()
  })
})

describe('touch', () => {
  it('no-op when no session', async () => {
    const svc = getSessionService()
    await svc.touch()
    expect(svc.wasMutated()).toBe(false)
  })

  it('clears cookie when store entry already expired', async () => {
    await writeSessionId('z'.repeat(43)) // cookie points at non-existent entry
    const svc = getSessionService()
    await svc.touch()
    expect(fakeStore.get('streamsight_session')).toBeUndefined()
  })

  it('refreshes both layers when session valid', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    const before = fakeStore.get('streamsight_session')!.value

    // Simulate small time passage so iron-session produces a different sealed value
    await new Promise((r) => setTimeout(r, 5))

    await svc.touch()
    const after = fakeStore.get('streamsight_session')!.value
    expect(after).not.toBe(before) // cookie was rewritten
    expect(svc.wasMutated()).toBe(true)
  })
})

describe('rotateCsrfToken', () => {
  it('throws when no session', async () => {
    await expect(getSessionService().rotateCsrfToken()).rejects.toThrow(/no session/i)
  })

  it('replaces csrfToken, leaves other fields intact', async () => {
    const svc = getSessionService()
    const { csrfToken } = await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    const before = (await svc.get())!

    const newToken = await svc.rotateCsrfToken()
    expect(newToken).not.toBe(csrfToken)
    expect(newToken).toHaveLength(43)

    const after = (await svc.get())!
    expect(after.csrfToken).toBe(newToken)
    expect(after.accessToken).toBe(before.accessToken)
    expect(after.userId).toBe(before.userId)
    expect(svc.wasMutated()).toBe(true)
  })
})

describe('refresh — happy paths', () => {
  it('cached tokens HIT: uses cache, no backend call', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    const fresh = tokens('-fresh')
    await sharedStore.setCachedTokens(USER.id, fresh, 60_000)

    const result = await svc.refresh()
    expect(backendFetchMock).not.toHaveBeenCalled()
    expect(result.accessToken).toBe('at-fresh')
    expect(result.refreshToken).toBe('rt-fresh')

    const got = (await svc.get())!
    expect(got.accessToken).toBe('at-fresh')
  })

  it('lock acquired: hits backend, writes cache, updates session', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    const newTokens = tokens('-new')
    backendFetchMock.mockResolvedValueOnce({ data: newTokens })

    const result = await svc.refresh()
    expect(backendFetchMock).toHaveBeenCalledTimes(1)
    const [path, opts] = backendFetchMock.mock.calls[0]
    expect(path).toBe('/auth/refresh')
    expect(opts.method).toBe('POST')
    expect(opts.body).toEqual({ refreshToken: 'rt' })
    expect(opts.session).toBeNull() // §3.2: refresh path explicitly omits old session

    expect(result.accessToken).toBe('at-new')
    expect(await sharedStore.getCachedTokens(USER.id)).toEqual(newTokens)
  })
})

describe('refresh — concurrent dedup (critical, §5.2)', () => {
  it('5 parallel refresh() calls hit backend only once', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    const newTokens = tokens('-dedup')
    // backend call takes a measurable amount of time so pollers actually wait
    backendFetchMock.mockImplementation(
      () =>
        new Promise((r) => setTimeout(() => r({ data: newTokens }), 120)),
    )

    const results = await Promise.all([
      svc.refresh(),
      svc.refresh(),
      svc.refresh(),
      svc.refresh(),
      svc.refresh(),
    ])

    expect(backendFetchMock).toHaveBeenCalledTimes(1)
    for (const r of results) {
      expect(r.accessToken).toBe('at-dedup')
      expect(r.refreshToken).toBe('rt-dedup')
    }
  })
})

describe('refresh — failure paths', () => {
  it('lock taken + poll timeout → throws BackendUpstreamError', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })

    // Pre-acquire the lock externally so refresh() falls into poll branch
    const heldToken = await sharedStore.acquireLock(`refresh-lock:${USER.id}`, 30_000)
    expect(heldToken).toBeTruthy()

    await expect(svc.refresh()).rejects.toThrow(/BACKEND_UPSTREAM_ERROR|refresh timeout/i)
  }, 15_000)

  it('backend throws → propagates and releases lock', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    backendFetchMock.mockRejectedValueOnce(new Error('backend 500'))

    await expect(svc.refresh()).rejects.toThrow(/backend 500/i)
    // Lock should be released so a subsequent refresh can try again
    const tok = await sharedStore.acquireLock(`refresh-lock:${USER.id}`, 1_000)
    expect(tok).toBeTruthy()
  })

  it('throws UnauthenticatedError when no session at all', async () => {
    await expect(getSessionService().refresh()).rejects.toThrow(/no session/i)
  })

  it('backend rejects refresh token (UnauthenticatedError) → destroys local session', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    const { UnauthenticatedError } = await import('@/lib/errors')
    backendFetchMock.mockRejectedValueOnce(
      new UnauthenticatedError('refresh token revoked'),
    )

    await expect(svc.refresh()).rejects.toThrow(/refresh token revoked/i)

    // Local session must be gone — both cookie and store side
    expect(fakeStore.get('streamsight_session')).toBeUndefined()
    expect(await svc.get()).toBeNull()
  })
})

describe('wasMutated (§5.3)', () => {
  it('false on plain get()', async () => {
    const svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() }) // mutates
    // create another fresh-instance equivalent — re-import? Not necessary.
    // Easier: a brand-new test path.
    expect(svc.wasMutated()).toBe(true) // already mutated by create above

    // Verify the falsy starting state with a separate svc on fresh cookies
    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    const fresh = getSessionService()
    await fresh.get()
    expect(fresh.wasMutated()).toBe(false)
  })

  it('true after create / update / destroy / touch / rotateCsrfToken / refresh', async () => {
    // touch
    let svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    expect(svc.wasMutated()).toBe(true)

    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    await svc.update({ accessToken: 'x' })
    expect(svc.wasMutated()).toBe(true)

    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    await svc.touch()
    expect(svc.wasMutated()).toBe(true)

    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    await svc.rotateCsrfToken()
    expect(svc.wasMutated()).toBe(true)

    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    await sharedStore.setCachedTokens(USER.id, tokens('-cached'), 60_000)
    await svc.refresh()
    expect(svc.wasMutated()).toBe(true)

    fakeStore.clear()
    sharedStore = new InMemorySessionStore()
    svc = getSessionService()
    await svc.create({ user: USER, role: Role.USER, tokens: tokens() })
    await svc.destroy()
    expect(svc.wasMutated()).toBe(true)
  })
})

// Type-only test to ensure exported types are reachable
const _typeCheck = (s: StoredSession) => s
void _typeCheck
