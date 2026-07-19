// Spec 012a §4.1/§4.4/§4.8 — admin password login. The BFF drives the
// backend's admin auth line and hides the snake_case contract:
//
//   1. POST /admin/auth/login  { username, password }  → TokenResponse
//   2. GET  /admin/me          Bearer ${access}        → AdminResponse
//   3. getSessionService().create(...) with adminRole embedded
//
// The public browser contract is unchanged (§4.9):
//   { data: { sessionId, csrfToken, user: { id, name }, expiresAt } }
//
// csrfExempt=true — an unauthenticated anonymous POST has no session to
// defend; Origin is still checked by createRoute.

import 'server-only'
import { z } from 'zod'

import { createRoute } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { decodeJwtPayload } from '@/lib/auth/decodeJwtPayload'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { getSessionService } from '@/lib/session/service'
import { Role, type RoleValue } from '@/lib/session/types'
import {
  BackendTokenResponse,
  BackendAdminMeResponse,
  adaptTokenResponse,
} from '@/lib/schemas/auth'

const LoginBody = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(256),
})

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
} as const

// Spec 012a §4.6 — the JWT `role` claim is the principal-type discriminator
// (0=USER, 1=ADMIN). Read it straight from the token; unknown → USER
// (fail-safe). /admin/me carries no `role`, so there is no /me override.
function resolveRole(accessToken: string): RoleValue {
  const claims = decodeJwtPayload(accessToken)
  return claims?.role === Role.ADMIN ? Role.ADMIN : Role.USER
}

export const POST = createRoute({
  csrfExempt: true,
  bodySchema: LoginBody,
  handler: async ({ body, requestId }) => {
    const { identifier, password } = body

    // Step 1 — BE /admin/auth/login. `identifier` carries username semantics
    // (admins have no email); the backend DTO normalises (strip + lower).
    const { data: rawTokens } = await backendFetch<unknown>(
      '/admin/auth/login',
      {
        method: 'POST',
        body: { username: identifier, password },
        requestId,
        passClientErrors: true,
      },
    )
    const tokensParsed = BackendTokenResponse.safeParse(rawTokens)
    if (!tokensParsed.success) {
      throw new ContractViolationError(
        `BE /admin/auth/login response shape mismatch: ${tokensParsed.error.message}`,
      )
    }
    const now = Date.now()
    const tokens = adaptTokenResponse(tokensParsed.data, now)

    // Step 2 — BE /admin/me with Bearer for the display name + admin_role.
    const { data: rawMe } = await backendFetch<unknown>('/admin/me', {
      method: 'GET',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      requestId,
    })
    const meParsed = BackendAdminMeResponse.safeParse(rawMe)
    if (!meParsed.success) {
      throw new ContractViolationError(
        `BE /admin/me response shape mismatch: ${meParsed.error.message} (raw: ${JSON.stringify(rawMe)})`,
      )
    }
    const me = meParsed.data

    // Step 3 — session.create. The stable user identity is the JWT `sub`
    // (principal_id), NOT me.id (admin child PK) — see §2.7/§4.5.
    const claims = decodeJwtPayload(tokens.accessToken)
    const principalId =
      typeof claims?.sub === 'string' ? claims.sub : String(claims?.sub ?? me.id)
    const role = resolveRole(tokens.accessToken)
    const user = { id: principalId, name: me.name }

    const result = await getSessionService().create({
      user,
      role,
      // admin_role from /admin/me is the freshest authoritative value (§4.8).
      adminRole: me.admin_role,
      tokens,
    })

    return new Response(
      JSON.stringify({
        data: {
          sessionId: result.sessionId,
          csrfToken: result.csrfToken,
          user,
          expiresAt: tokens.accessTokenExpiresAt,
        },
      }),
      { status: 200, headers: NO_STORE_HEADERS },
    )
  },
})
