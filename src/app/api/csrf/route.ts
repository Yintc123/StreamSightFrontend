import 'server-only'
import { createRoute, okResponse } from '@/lib/api'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'

export const GET = createRoute({
  handler: async ({ session }) => {
    if (!session) throw new UnauthenticatedError('no session')
    return okResponse({ csrfToken: session.csrfToken })
  },
})
