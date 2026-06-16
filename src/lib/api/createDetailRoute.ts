// Spec 004 / spec 017 — Detail-endpoint Route-Handler factory.
//
// Parallel to `createListRoute` but for single-resource lookups:
//   GET /api/<resource>/:id  →  upstream  GET /user/v1/donation/<X>/:id
//
// Per-route config is 3 lines (upstream prefix + backend Zod schema +
// client mapper). Path-level UUID validation lives in the factory so
// each per-route file stays minimal.
//
// Two behaviours that diverge from list:
//   - 404 propagation: `backendFetch` already classifies upstream 404 as
//     `NotFoundError`, which `toErrorResponse` maps to client 404. We do
//     NOT remap to 502 — RSC pages rely on this to call `notFound()`.
//   - `Accept-Language` forwarded so backend detail's i18n fallback
//     (spec 017 §2 v0.3) sees the user's locale.

import 'server-only'
import { z, type ZodType } from 'zod'

import { ContractViolationError } from '@/lib/errors/ContractViolationError'

import { backendFetch } from './backend'
import { createRoute } from './create-route'
import { okResponse } from './responses'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DetailParams = z.object({
  id: z.string().regex(UUID_V4_RE, 'invalid uuid v4'),
})

export interface CreateDetailRouteOptions<TBackend, TClient> {
  /** Upstream backend path prefix, e.g. `/user/v1/donation/charities`. */
  upstream: string
  /** Zod schema describing the backend detail response shape. */
  backendSchema: ZodType<TBackend>
  /** Backend → client mapper. */
  toClient: (raw: TBackend) => TClient
}

export function createDetailRoute<TBackend, TClient>(
  opts: CreateDetailRouteOptions<TBackend, TClient>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return createRoute({
    paramsSchema: DetailParams,
    handler: async ({ req, params, requestId }) => {
      const acceptLanguage = req.headers.get('accept-language') ?? undefined
      const upstreamPath = `${opts.upstream}/${params.id}`
      const { data } = await backendFetch<unknown>(upstreamPath, {
        headers: acceptLanguage ? { 'accept-language': acceptLanguage } : undefined,
        requestId,
      })
      const parsed = opts.backendSchema.safeParse(data)
      if (!parsed.success) {
        throw new ContractViolationError(
          `Upstream ${upstreamPath} response failed schema: ${parsed.error.message}`,
        )
      }
      return okResponse(opts.toClient(parsed.data))
    },
  })
}
