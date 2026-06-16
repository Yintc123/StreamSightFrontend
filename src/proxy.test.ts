// Spec 005 v0.5 — Proxy auth gate for `/cms/*`.
//
// Pins: cookie present → next(); cookie absent → 307 redirect to `/`.

import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy, config } from './proxy'

function buildRequest(
  url: string,
  { cookie }: { cookie?: string } = {},
): NextRequest {
  const req = new NextRequest(url)
  if (cookie) {
    // happy-dom's Request strips the `cookie` header on construction in
    // some Next.js builds; setting via NextRequest's RequestCookies API
    // is the reliable cross-version path.
    for (const pair of cookie.split(/;\s*/)) {
      const [name, ...rest] = pair.split('=')
      if (name) req.cookies.set(name.trim(), rest.join('='))
    }
  }
  return req
}

describe('proxy (Next.js 16) — /cms auth gate', () => {
  it('lets the request through when the session cookie is present', () => {
    const req = buildRequest('http://localhost:3000/cms', {
      cookie: 'jko_session=opaque-sealed-blob',
    })
    const res = proxy(req)
    // Allow = NOT a redirect. Asserting on `location` keeps the test
    // robust across Next.js versions (the internal `x-middleware-next`
    // header is implementation detail).
    expect(res.headers.get('location')).toBeNull()
    expect([200, 204]).toContain(res.status)
  })

  it('lets nested `/cms/*` through when cookie is present', () => {
    const req = buildRequest('http://localhost:3000/cms/orders', {
      cookie: 'jko_session=blob',
    })
    const res = proxy(req)
    expect(res.headers.get('location')).toBeNull()
    expect([200, 204]).toContain(res.status)
  })

  it('redirects to `/?reason=cms-auth` when no cookie is set', () => {
    const req = buildRequest('http://localhost:3000/cms')
    const res = proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/?reason=cms-auth',
    )
  })

  it('redirects to `/?reason=cms-auth` when an unrelated cookie is set but session is missing', () => {
    const req = buildRequest('http://localhost:3000/cms/charities', {
      cookie: 'other=1',
    })
    const res = proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/?reason=cms-auth',
    )
  })

  it('drops any incoming query string and replaces with the auth reason', () => {
    const req = buildRequest('http://localhost:3000/cms?tab=foo')
    const res = proxy(req)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/?reason=cms-auth',
    )
  })

  it('matcher covers `/cms` and `/cms/:path*` only', () => {
    expect(config.matcher).toEqual(['/cms', '/cms/:path*'])
  })
})
