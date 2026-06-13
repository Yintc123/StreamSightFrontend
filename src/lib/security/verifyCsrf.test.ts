import { describe, it, expect } from 'vitest'
import { verifyCsrf } from './verifyCsrf'
import { CsrfError } from '@/lib/errors/CsrfError'
import type { StoredSession } from '@/lib/session/types'

const VALID_TOKEN = 'a'.repeat(43)

function makeSession(csrfToken = VALID_TOKEN): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'u1', name: 'Alice' },
    csrfToken,
    createdAt: now,
  }
}

type ReqInit = {
  method?: string
  origin?: string | null
  referer?: string | null
  csrfToken?: string | null
}

function makeReq(init: ReqInit = {}): Request {
  const headers = new Headers()
  if (init.origin) headers.set('origin', init.origin)
  if (init.referer != null) headers.set('referer', init.referer)
  if (init.csrfToken != null) headers.set('x-csrf-token', init.csrfToken)
  return { method: init.method ?? 'POST', headers } as Request
}

describe('verifyCsrf — safe methods', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('%s short-circuits and passes', (method) => {
    // Even with no session, no origin, no token
    expect(() => verifyCsrf(makeReq({ method, origin: null }), null)).not.toThrow()
  })
})

describe('verifyCsrf — origin gate', () => {
  it('throws when neither Origin nor Referer present', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: null, referer: null }), makeSession(), { exempt: true }),
    ).toThrow(CsrfError)
  })

  it('throws when origin not in allow-list', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: 'http://evil.com' }), makeSession()),
    ).toThrow(CsrfError)
  })

  it('throws when origin not in allow-list even with exempt=true', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: 'http://evil.com' }), null, { exempt: true }),
    ).toThrow(CsrfError)
  })

  it('throws when Referer is unparseable and Origin missing', () => {
    expect(() =>
      verifyCsrf(
        makeReq({ origin: null, referer: 'garbage', csrfToken: VALID_TOKEN }),
        makeSession(),
      ),
    ).toThrow(CsrfError)
  })

  it('accepts Referer fallback when Origin missing but Referer in allow-list', () => {
    expect(() =>
      verifyCsrf(
        makeReq({
          origin: null,
          referer: 'http://localhost:3000/page',
          csrfToken: VALID_TOKEN,
        }),
        makeSession(),
      ),
    ).not.toThrow()
  })
})

describe('verifyCsrf — exempt mode', () => {
  it('passes when exempt=true and origin valid, no session/token required', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: 'http://localhost:3000' }), null, { exempt: true }),
    ).not.toThrow()
  })
})

describe('verifyCsrf — non-exempt token verification', () => {
  it('throws when session is null (no token to compare against)', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: 'http://localhost:3000' }), null),
    ).toThrow(CsrfError)
  })

  it('throws when X-CSRF-Token header missing', () => {
    expect(() =>
      verifyCsrf(makeReq({ origin: 'http://localhost:3000' }), makeSession()),
    ).toThrow(CsrfError)
  })

  it('throws on wrong-length token without leaking timingSafeEqual exception', () => {
    expect(() =>
      verifyCsrf(
        makeReq({ origin: 'http://localhost:3000', csrfToken: 'too-short' }),
        makeSession(),
      ),
    ).toThrow(CsrfError)
  })

  it('throws on same-length but mismatched token', () => {
    expect(() =>
      verifyCsrf(
        makeReq({ origin: 'http://localhost:3000', csrfToken: 'b'.repeat(43) }),
        makeSession(),
      ),
    ).toThrow(CsrfError)
  })

  it('passes when origin valid and token matches', () => {
    expect(() =>
      verifyCsrf(
        makeReq({ origin: 'http://localhost:3000', csrfToken: VALID_TOKEN }),
        makeSession(),
      ),
    ).not.toThrow()
  })
})
