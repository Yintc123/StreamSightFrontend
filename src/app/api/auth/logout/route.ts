import 'server-only'
import { createRoute } from '@/lib/api'
import { getSessionService } from '@/lib/session/service'

export const POST = createRoute({
  handler: async () => {
    await getSessionService().destroy()
    return new Response(null, { status: 204 })
  },
})
