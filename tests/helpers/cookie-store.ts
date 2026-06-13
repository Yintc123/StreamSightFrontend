/**
 * Map-backed fake of the cookie store Next's `cookies()` returns inside a
 * Route Handler. Sufficient for iron-session round-trip tests. Not a complete
 * implementation of ReadonlyRequestCookies / RequestCookies.
 */
export type FakeCookie = {
  name: string
  value: string
}

export type FakeCookieStore = {
  get(name: string): FakeCookie | undefined
  set(name: string, value: string, options?: unknown): void
  delete(name: string): void
  clear(): void
}

export function createFakeCookieStore(): FakeCookieStore {
  const store = new Map<string, string>()
  return {
    get(name) {
      const value = store.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set(name, value, options) {
      // Mirror browser semantics: empty value or maxAge<=0 means the server
      // told us to delete this cookie. iron-session's destroy() sets value=''
      // + maxAge=0; treating it as set('') would leave a phantom entry.
      const opts = (options ?? {}) as { maxAge?: number; expires?: Date }
      const cleared =
        value === '' ||
        opts.maxAge === 0 ||
        (opts.expires instanceof Date && opts.expires.getTime() <= Date.now())
      if (cleared) store.delete(name)
      else store.set(name, value)
    },
    delete(name) {
      store.delete(name)
    },
    clear() {
      store.clear()
    },
  }
}
