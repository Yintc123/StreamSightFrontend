// Spec 011 §3.4 (v0.2) — dev login now bridges to BE auth so the issued
// session carries a real admin JWT, not a fake string. Without this the
// CMS routes 401 the moment they call BE admin endpoints.
//
// Flow mirrors /api/auth/register two-leg dance, but reads credentials
// from env (defaults match BE prisma/seed.ts bootstrapAdmin):
//   1. POST /auth/login  { identifier, password }  → tokens
//   2. GET  /auth/me     Bearer ${access}          → user + role
//   3. getSessionService().create(...)
//
// Disabled in production / when ENABLE_DEV_LOGIN=0; csrfExempt=true so
// the empty-body POST from the homepage skip-login button gets through.

import 'server-only'
import { createRoute } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { env } from '@/lib/config'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { getSessionService } from '@/lib/session/service'
import {
  BackendMeResponse,
  BackendRegisterResponse as BackendLoginResponse,
} from '@/lib/schemas/auth'

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
} as const

export const POST = createRoute({
  csrfExempt: true,
  handler: async ({ requestId }) => {
    if (env.NODE_ENV === 'production' || env.ENABLE_DEV_LOGIN !== '1') {
      throw new NotFoundError('dev login disabled')
    }

    // Step 1 — BE /auth/login with seeded admin creds.
    const { data: rawTokens } = await backendFetch<unknown>('/auth/login', {
      method: 'POST',
      body: {
        identifier: env.DEV_ADMIN_USERNAME,
        password: env.DEV_ADMIN_PASSWORD,
      },
      requestId,
      passClientErrors: true,
    })
    const tokensParsed = BackendLoginResponse.safeParse(rawTokens)
    if (!tokensParsed.success) {
      throw new ContractViolationError(
        `BE /auth/login response shape mismatch: ${tokensParsed.error.message}`,
      )
    }
    const tokens = tokensParsed.data

    // Step 2 — BE /auth/me with Bearer.
    const { data: rawMe } = await backendFetch<unknown>('/auth/me', {
      method: 'GET',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      requestId,
    })
    const meParsed = BackendMeResponse.safeParse(rawMe)
    if (!meParsed.success) {
      throw new ContractViolationError(
        `BE /auth/me response shape mismatch: ${meParsed.error.message}`,
      )
    }
    const me = meParsed.data

    // Step 3 — session.create with the REAL admin tokens.
    const now = Date.now()
    const accessTokenExpiresAt = now + tokens.accessExpiresIn * 1000
    const refreshTokenExpiresAt = now + tokens.refreshExpiresIn * 1000
    const name = me.username ?? me.email ?? 'Admin'
    const role = me.role === 0 ? 0 : 1
    const user = { id: me.id, name }

    const result = await getSessionService().create({
      user,
      role,
      tokens: {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt,
      },
    })

    return new Response(
      JSON.stringify({
        data: {
          sessionId: result.sessionId,
          csrfToken: result.csrfToken,
          user,
          expiresAt: accessTokenExpiresAt,
        },
      }),
      { status: 200, headers: NO_STORE_HEADERS },
    )
  },
})
