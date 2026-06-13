import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeCookieStore } from '../../../tests/helpers/cookie-store'

const fakeStore = createFakeCookieStore()

vi.mock('next/headers', () => ({
  cookies: async () => fakeStore,
}))

import {
  newSessionId,
  readSessionId,
  writeSessionId,
  clearSessionCookie,
} from './cookie'

describe('cookie layer', () => {
  beforeEach(() => {
    fakeStore.clear()
  })

  describe('newSessionId', () => {
    it('produces a 43-char base64url string', () => {
      const id = newSessionId()
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(id).toHaveLength(43)
    })

    it('produces a different value on every call', () => {
      const a = newSessionId()
      const b = newSessionId()
      expect(a).not.toBe(b)
    })
  })

  describe('read / write round-trip', () => {
    it('writeSessionId then readSessionId returns the same id', async () => {
      const id = newSessionId()
      await writeSessionId(id)
      expect(await readSessionId()).toBe(id)
    })

    it('readSessionId returns null when no cookie present', async () => {
      expect(await readSessionId()).toBeNull()
    })

    it('readSessionId returns null when cookie value is tampered', async () => {
      const id = newSessionId()
      await writeSessionId(id)
      const cookie = fakeStore.get('jko_session')!
      // Corrupt one character of the sealed value
      fakeStore.set('jko_session', cookie.value.slice(0, -3) + 'AAA')
      expect(await readSessionId()).toBeNull()
    })

    it('clearSessionCookie removes the cookie', async () => {
      await writeSessionId(newSessionId())
      await clearSessionCookie()
      expect(await readSessionId()).toBeNull()
    })
  })
})
