import 'server-only'
import { createRoute } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { getSessionService } from '@/lib/session/service'

export const POST = createRoute({
  handler: async () => {
    const svc = getSessionService()
    const session = await svc.get()

    // Revoke the refresh token family on the backend (best-effort).
    // Skipped when refresh_token is null (admin auth line, see spec 012a OQ-Q7).
    // Local session is always destroyed regardless of backend outcome.
    if (session?.refreshToken) {
      await backendFetch('/auth/logout', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
        session: null,
      }).catch(() => {})
    }

    await svc.destroy()
    return new Response(null, { status: 204 })
  },
})
