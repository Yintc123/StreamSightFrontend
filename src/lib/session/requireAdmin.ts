import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionService } from './service'
import { Role, type StoredSession } from './types'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { BackendClientError } from '@/lib/errors/BackendClientError'

/**
 * Spec 011 §3.5 — RSC admin gate.
 *
 * Null session OR non-admin role → redirect to `/?reason=cms-not-admin`.
 * `AuthRedirectToast` (spec 010 §3.3) handles the `cms-not-admin` reason
 * with `toast.error('需要管理員權限')`.
 *
 * For BFF route handlers use `createAdminRoute()` instead; this helper
 * is for RSC (page.tsx / layout.tsx) where `redirect()` works.
 */
export async function requireAdminSession(): Promise<StoredSession> {
  const session = await getSessionService().get()
  if (!session || session.role !== Role.ADMIN) {
    redirect('/?reason=cms-not-admin')
  }
  return session
}

/**
 * Spec 013a §2 — SUPER_ADMIN-or-above page gate (e.g. /cms/admins).
 *
 * A missing / non-admin session redirects to the homepage like
 * `requireAdminSession`. An admin who is NOT super_admin or root is
 * authenticated for the CMS but lacks admin-management rights, so they
 * bounce back to `/cms?reason=not-super-admin` (not the homepage). Root
 * (rank 999) is above super_admin and is always allowed. Nav visibility is
 * a separate UX affordance; this is the real gate. Backend 403/422 remain
 * authoritative.
 */
export async function requireSuperAdminSession(): Promise<StoredSession> {
  const session = await getSessionService().get()
  if (!session || session.role !== Role.ADMIN) {
    redirect('/?reason=cms-not-admin')
  }
  const canManage = session.adminRole === 'super_admin' || session.adminRole === 'root'
  if (!canManage) {
    redirect('/cms?reason=not-super-admin')
  }
  return session
}

/**
 * Spec 011 §3.5 — wrap RSC admin fetches.
 *
 * `requireAdminSession()` guards the page entry, but fetches *inside* the
 * page can still fail with auth errors after that gate runs:
 *   - 401: token expired and refresh declined (backendFetch destroys the
 *     session itself before throwing UnauthenticatedError).
 *   - 403: account was demoted mid-session (backendFetch lets these
 *     through as BackendClientError 403; we destroy here to keep the gate
 *     fail-closed).
 *
 * Either way the user lands on `/` with `?reason=cms-not-admin` so the
 * homepage toast explains why.
 */
export async function ensureAdminAccess<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isAuthFailure(e)) {
      await getSessionService().destroy().catch(() => {})
      redirect('/?reason=cms-not-admin')
    }
    throw e
  }
}

function isAuthFailure(e: unknown): boolean {
  if (e instanceof UnauthenticatedError) return true
  if (e instanceof BackendClientError && e.upstreamStatus === 403) return true
  return false
}
