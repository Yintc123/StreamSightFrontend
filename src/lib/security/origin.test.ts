import { describe, it, expect } from 'vitest'
import { allowedOrigins, extractOriginFromReferer } from './origin'

describe('allowedOrigins', () => {
  it('reads from vitest test.env (http://localhost:3000)', () => {
    // vitest.config.ts sets ALLOWED_ORIGINS=http://localhost:3000 for tests
    expect(allowedOrigins.has('http://localhost:3000')).toBe(true)
    expect(allowedOrigins.has('http://evil.com')).toBe(false)
  })
})

describe('extractOriginFromReferer', () => {
  function reqWithReferer(referer: string | null): Request {
    // Referer is a forbidden header; the Request constructor silently strips it.
    // Hand-roll the minimal shape verifyCsrf actually consumes.
    return { headers: new Headers(referer !== null ? { referer } : {}) } as Request
  }

  it('returns origin for an HTTPS URL', () => {
    expect(extractOriginFromReferer(reqWithReferer('https://example.com/path?q=1'))).toBe(
      'https://example.com',
    )
  })

  it('preserves explicit port', () => {
    expect(extractOriginFromReferer(reqWithReferer('https://example.com:8080/path'))).toBe(
      'https://example.com:8080',
    )
  })

  it('returns null when Referer absent', () => {
    expect(extractOriginFromReferer(reqWithReferer(null))).toBeNull()
  })

  it('returns null when Referer is unparseable', () => {
    expect(extractOriginFromReferer(reqWithReferer('not a url'))).toBeNull()
  })
})
