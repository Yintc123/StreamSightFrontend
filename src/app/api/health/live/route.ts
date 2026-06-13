import 'server-only'
import { createRoute, okResponse } from '@/lib/api'

export const GET = createRoute({
  handler: async () => okResponse({ status: 'ok' }),
})
