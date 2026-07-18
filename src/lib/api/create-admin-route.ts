import 'server-only'
import type { ZodType } from 'zod'
import type { StoredSession } from '@/lib/session/types'
import { Role } from '@/lib/session/types'
import { ForbiddenError } from '@/lib/errors/ForbiddenError'
import { createRoute } from './create-route'

/**
 * Spec 013a §3.1 — SUPER_ADMIN-only route wrapper for `/api/cms/admins*`.
 *
 * Best practice: do NOT re-build the pipeline. This is a thin wrapper over
 * `createRoute` that only adds two things on top of the shared factory
 * (params/query/body schemas, CSRF, single session read, touch):
 *
 *   1. Forces `requireAuth: true` — the handler's `session` is non-null.
 *   2. Asserts `role === ADMIN && adminRole === 'super_admin'` before the
 *      handler runs; otherwise throws ForbiddenError (403).
 *
 * The gate is a fast-fail affordance: the backend `require_min_admin_role`
 * remains the authoritative check (403/422 flow through backendFetch).
 *
 * Self-service endpoints (`/api/cms/me*`) are open to any authenticated
 * admin and MUST use `createRoute({ requireAuth: true })` directly instead.
 */
type AdminRouteOptions<TBody, TQuery, TParams> = {
  bodySchema?: ZodType<TBody>
  querySchema?: ZodType<TQuery>
  paramsSchema?: ZodType<TParams>
  csrfExempt?: boolean
  handler: (args: {
    req: Request
    requestId: string
    body: TBody
    query: TQuery
    params: TParams
    session: StoredSession
  }) => Promise<Response> | Response
}

export function createAdminRoute<
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
>(opts: AdminRouteOptions<TBody, TQuery, TParams>) {
  return createRoute<TBody, TQuery, TParams, true>({
    requireAuth: true,
    bodySchema: opts.bodySchema,
    querySchema: opts.querySchema,
    paramsSchema: opts.paramsSchema,
    csrfExempt: opts.csrfExempt,
    handler: (args) => {
      const { session } = args // non-null: requireAuth true
      if (session.role !== Role.ADMIN || session.adminRole !== 'super_admin') {
        throw new ForbiddenError('super admin required')
      }
      return opts.handler(args)
    },
  })
}
