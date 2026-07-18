import 'server-only'
import { createRoute, okResponse } from '@/lib/api'
import { STREAMLIT_PRE_REFRESH_THRESHOLD_MS } from '@/lib/api/constants'
import { getSessionService } from '@/lib/session/service'
import type { StoredSession } from '@/lib/session/types'

export const GET = createRoute({
  requireAuth: true,
  handler: async ({ session }) => {
    const svc = getSessionService()
    let resolved: StoredSession = session
    if (session.accessTokenExpiresAt - Date.now() < STREAMLIT_PRE_REFRESH_THRESHOLD_MS) {
      resolved = await svc.refresh()
    }
    return okResponse({
      user: resolved.user,
      role: resolved.role,
      ...(resolved.adminRole ? { adminRole: resolved.adminRole } : {}),
      accessToken: resolved.accessToken,
      expiresAt: resolved.accessTokenExpiresAt,
      csrfToken: resolved.csrfToken,
    })
  },
})
