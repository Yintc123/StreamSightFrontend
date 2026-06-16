// Spec 011a — client-side CSRF token fetcher.
//
// `createAdminRoute` (and any non-csrfExempt route) verifies the
// `x-csrf-token` header against `session.csrfToken` on non-safe methods.
// The token lives in iron-session and isn't readable by JS directly, so
// client code calls `GET /api/csrf` first to surface it. Re-fetched per
// mutation — token rotation is rare; the extra round-trip is acceptable
// for admin operations.

export async function getCsrfToken(): Promise<string> {
  const res = await fetch('/api/csrf', { credentials: 'same-origin' })
  if (!res.ok) {
    throw new Error(`/api/csrf failed: ${res.status}`)
  }
  const body = (await res.json()) as { data?: { csrfToken?: unknown } }
  const token = body?.data?.csrfToken
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('/api/csrf returned no token')
  }
  return token
}
