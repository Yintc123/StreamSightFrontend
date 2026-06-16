// Spec 011 §3.4 (v0.3) — dev login bridges to BE auth so the issued
// session carries a real JWT. Accepts optional `{ identifier, password }`
// body for caller-provided credentials (LoginCard form); falls back to
// env DEV_ADMIN_USERNAME / DEV_ADMIN_PASSWORD when body is absent
// (skip-login style API call / scripts).
//
//   1. POST /auth/login  { identifier, password }  → tokens
//   2. GET  /auth/me     Bearer ${access}          → user (role from JWT)
//   3. getSessionService().create(...)
//
// Disabled in production / when ENABLE_DEV_LOGIN=0. csrfExempt=true —
// unauthenticated anonymous POST has no session to defend.

import 'server-only'
import { z } from 'zod'

import { createRoute } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { decodeJwtPayload } from '@/lib/auth/decodeJwtPayload'
import { env } from '@/lib/config'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { getSessionService } from '@/lib/session/service'
import { Role, type RoleValue } from '@/lib/session/types'
import {
  BackendMeResponse,
  BackendRegisterResponse as BackendLoginResponse,
} from '@/lib/schemas/auth'

// Optional body — both fields together or neither (env fallback).
const LoginBody = z
  .object({
    identifier: z.string().min(1).max(254).optional(),
    password: z.string().min(1).max(256).optional(),
  })
  .optional()

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
} as const

function resolveRole(
  meRole: number | null | undefined,
  accessToken: string,
): RoleValue {
  // /me wins if BE ships role there in a future API rev.
  if (meRole === Role.ADMIN || meRole === Role.USER) {
    return meRole
  }
  const claims = decodeJwtPayload(accessToken)
  const claimRole = claims?.role
  return claimRole === Role.ADMIN ? Role.ADMIN : Role.USER
}

export const POST = createRoute({
  csrfExempt: true,
  bodySchema: LoginBody,
  handler: async ({ body, requestId }) => {
    if (env.NODE_ENV === 'production' || env.ENABLE_DEV_LOGIN !== '1') {
      throw new NotFoundError('dev login disabled')
    }

    // Use caller-supplied credentials if both present; otherwise the
    // env-seeded fallback (matches BE prisma/seed.ts bootstrapAdmin).
    const identifier = body?.identifier ?? env.DEV_ADMIN_USERNAME
    const password = body?.password ?? env.DEV_ADMIN_PASSWORD

    // Step 1 — BE /auth/login
    const { data: rawTokens } = await backendFetch<unknown>('/auth/login', {
      method: 'POST',
      body: { identifier, password },
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

    // Step 3 — session.create with the real tokens.
    //
    // BE /auth/me does NOT return `role` (BE 008 §6.4 — role lives only
    // in the JWT claims per spec 007 §10.10). Decode the access token to
    // read it; the response Zod schema accepts `role` as optional so we
    // fall back to JWT only when BE omits it from /me.
    const now = Date.now()
    const accessTokenExpiresAt = now + tokens.accessExpiresIn * 1000
    const refreshTokenExpiresAt = now + tokens.refreshExpiresIn * 1000
    const name = me.username ?? me.email ?? 'User'
    const role = resolveRole(me.role, tokens.accessToken)
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
