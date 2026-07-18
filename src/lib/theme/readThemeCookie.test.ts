import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeCookieStore } from '../../../tests/helpers/cookie-store'
import { THEME_COOKIE } from './schema'

const fakeStore = createFakeCookieStore()

vi.mock('next/headers', () => ({
  cookies: async () => fakeStore,
}))

// import 放在 mock 後面，確保 mock 已生效（同 cookie.test.ts 慣例）
import { readThemeCookie } from './readThemeCookie'

beforeEach(() => {
  fakeStore.clear()
})

describe('readThemeCookie', () => {
  it('cookie=light → "light"', async () => {
    fakeStore.set(THEME_COOKIE, 'light')
    expect(await readThemeCookie()).toBe('light')
  })

  it('cookie=dark → "dark"', async () => {
    fakeStore.set(THEME_COOKIE, 'dark')
    expect(await readThemeCookie()).toBe('dark')
  })

  it('無 cookie → "dark"（缺省）', async () => {
    expect(await readThemeCookie()).toBe('dark')
  })

  it('cookie=亂值 → "dark"（Zod 收斂）', async () => {
    fakeStore.set(THEME_COOKIE, 'system')
    expect(await readThemeCookie()).toBe('dark')
  })
})
