import 'server-only'
import { createRoute, okResponse } from '@/lib/api'
import { DEV_LOGIN_ACCESS_TTL_MS, DEV_LOGIN_REFRESH_TTL_MS } from '@/lib/api/constants'
import { env } from '@/lib/config'
import { getSessionService } from '@/lib/session/service'
import { NotFoundError } from '@/lib/errors/NotFoundError'

const DEV_USER = { id: 'dev-user-1', name: 'Dev User' }

export const POST = createRoute({
  csrfExempt: true,
  handler: async () => {
    if (env.NODE_ENV === 'production' || env.ENABLE_DEV_LOGIN !== '1') {
      throw new NotFoundError('dev login disabled')
    }
    const now = Date.now()
    const result = await getSessionService().create({
      user: DEV_USER,
      tokens: {
        accessToken: 'dev-fake-access-token',
        accessTokenExpiresAt: now + DEV_LOGIN_ACCESS_TTL_MS,
        refreshToken: 'dev-fake-refresh-token',
        refreshTokenExpiresAt: now + DEV_LOGIN_REFRESH_TTL_MS,
      },
    })
    return okResponse({
      ...result,
      user: DEV_USER,
      expiresAt: now + DEV_LOGIN_ACCESS_TTL_MS,
    })
  },
})
