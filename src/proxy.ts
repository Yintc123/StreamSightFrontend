// Next.js 16 Proxy (formerly known as Middleware — see
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
//
// Auth gate for `/cms` and `/cms/*`. Spec 005 v0.5 §4 → §6 OQ —
// these routes are the post-login CMS placeholder; unauthenticated
// users get redirected to `/` (homepage with LoginCard).
//
// **Optimistic check only** (Next.js auth guide §"Optimistic checks
// with Proxy"). We only inspect cookie presence here — iron-session
// seal/unseal needs the SESSION_SECRET and the Redis lookup happens in
// `getSessionService().get()`, neither of which we want to run on every
// prefetch. Full validation lives in `src/app/cms/page.tsx` (the RSC
// re-checks via `getSessionService().get()`). This two-layer pattern
// matches the Next.js auth doc's "Optimistic check + Data Access Layer"
// guidance.

import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'streamsight_session'

export function proxy(request: NextRequest): NextResponse {
  const hasSessionCookie = Boolean(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  )
  if (hasSessionCookie) {
    return NextResponse.next()
  }
  // No cookie → almost certainly not logged in. Send back to `/` for the
  // login card. We intentionally drop the original pathname (no `?next=`
  // round-trip) — that UX is on the OQ list in spec 010 §7 and can be
  // added once we wire a `next` query param into LoginCard.
  //
  // `?reason=cms-auth` lets the homepage AuthRedirectToast surface a
  // toast ("無使用 cms 權限") so users know why they bounced — see
  // src/app/AuthRedirectToast.tsx + spec 010 §3.3.
  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = '?reason=cms-auth'
  return NextResponse.redirect(url)
}

export const config = {
  // Match the CMS index and every nested route. Listed explicitly rather
  // than using a `(?!api|_next|...)` negative lookahead because we only
  // want this guard on `/cms*`, not the rest of the app.
  matcher: ['/cms', '/cms/:path*'],
}
