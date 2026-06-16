// Spec 007 v0.2 §5 — BFF route for the public register flow.
//
// Two-leg backend dance:
//   1. POST /auth/register   → BE issues token bundle (BE 008 §8.1; flat
//                              shape, no user)
//   2. GET  /auth/me         → BE returns Account profile (BE 008 §6.4),
//                              using the access JWT from step 1
//
// Note: auth endpoints are NOT under `/v1/` (BE 008 §3 / spec 007 v0.2
// §10.x); only `/v1/donation/*` carries the version prefix.
//
// Then BFF builds an iron-session (user + tokens), returns 201 with the
// session id + csrf token. Either step failing leaves no session — see
// test 5b: never half-build state.
//
// CSRF: csrfExempt=true, matching dev-login. Anonymous registrants have
// no session yet, so the token-comparison gate would be unreachable; the
// Origin/Referer check inside verifyCsrf still runs and blocks cross-site
// POSTs.

import 'server-only'

import { createRoute } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { getSessionService } from '@/lib/session/service'
import {
  BackendMeResponse,
  BackendRegisterResponse,
  RegisterRequest,
  type ClientUser,
} from '@/lib/schemas/auth'

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
} as const

export const POST = createRoute({
  csrfExempt: true,
  bodySchema: RegisterRequest,
  handler: async ({ body, requestId }) => {
    // Step 1 — BE register, returns tokens only. `passClientErrors` so that
    // 400 VALIDATION_FAILED / 409 AUTH_USERNAME_TAKEN / 429 AUTH_RATE_LIMITED
    // propagate to the FE with their original status (spec 007 §5.4).
    const { data: rawTokens } = await backendFetch<unknown>(
      '/auth/register',
      { method: 'POST', body, requestId, passClientErrors: true },
    )
    const tokensParsed = BackendRegisterResponse.safeParse(rawTokens)
    if (!tokensParsed.success) {
      throw new ContractViolationError(
        `BE /auth/register response shape mismatch: ${tokensParsed.error.message}`,
      )
    }
    const tokens = tokensParsed.data

    // Step 2 — BE /auth/me with Bearer, gets profile.
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

    // Step 3 — bridge token TTLs (BE: seconds, FE session: ms epoch) and
    // build the in-session user object.
    const now = Date.now()
    const accessTokenExpiresAt = now + tokens.accessExpiresIn * 1000
    const refreshTokenExpiresAt = now + tokens.refreshExpiresIn * 1000

    // BE's /me returns username and email as nullable. Display name falls
    // back to email (then to a generic placeholder) so the CMS landing
    // page always has something to print.
    const name = me.username ?? me.email ?? 'User'

    const sessionResult = await getSessionService().create({
      user: { id: me.id, name },
      tokens: {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt,
      },
    })

    const clientUser: ClientUser = {
      id: me.id,
      name,
      email: me.email,
      role: me.role ?? 1, // default to USER (1) when /me doesn't return role
    }

    return new Response(
      JSON.stringify({
        data: {
          sessionId: sessionResult.sessionId,
          csrfToken: sessionResult.csrfToken,
          user: clientUser,
          expiresAt: accessTokenExpiresAt,
        },
      }),
      { status: 201, headers: NO_STORE_HEADERS },
    )
  },
})
