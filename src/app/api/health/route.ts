import 'server-only'
import { createRoute } from '@/lib/api'
import { env } from '@/lib/config'
import { getSessionStore } from '@/lib/session/store'

export const GET = createRoute({
  handler: async () => {
    const redisOk = await getSessionStore()
      .ping()
      .catch(() => false)
    const body = {
      data: {
        status: redisOk ? 'ok' : 'degraded',
        uptime: process.uptime(),
        version: env.APP_VERSION,
        commit: env.APP_COMMIT,
        deps: { redis: redisOk ? 'ok' : 'down' },
      },
    }
    return new Response(JSON.stringify(body), {
      status: redisOk ? 200 : 503,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store, private',
      },
    })
  },
})
