import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { CsrfError } from '@/lib/errors/CsrfError'
import { allowedOrigins, extractOriginFromReferer } from './origin'
import type { StoredSession } from '@/lib/session/types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type VerifyCsrfOptions = {
  exempt?: boolean
}

export function verifyCsrf(
  req: Request,
  session: StoredSession | null,
  options: VerifyCsrfOptions = {},
): void {
  if (SAFE_METHODS.has(req.method)) return

  const origin = req.headers.get('origin') ?? extractOriginFromReferer(req)
  if (!origin || !allowedOrigins.has(origin)) {
    throw new CsrfError('Invalid origin')
  }

  if (options.exempt) return

  if (!session) {
    throw new CsrfError('No session for CSRF verification')
  }
  const provided = req.headers.get('x-csrf-token') ?? ''
  if (!constantTimeEqual(provided, session.csrfToken)) {
    throw new CsrfError('CSRF token mismatch')
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
