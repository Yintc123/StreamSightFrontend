// Spec 002 §2 — generic list Route-Handler factory.
//
// One factory feeds three near-identical endpoints (charities / donations /
// items). Each per-route file is a 2-3 line config: upstream path + Zod
// schema describing what the backend emits + a tiny mapper that strips
// backend-only fields (createdAt / updatedAt) and reshapes categories from
// inflated `[{id, key, displayName}]` (backend spec 016 v0.13) down to a
// plain `string[]` of keys (client expectation, spec 002 §3.2).
//
// Limit is locked at 10 to match the spec 002 §1.3 / brief v0.3 infinite-
// scroll cadence. The client does NOT get to override it; if a different
// page size is ever needed it should go through the spec, not the URL.
//
// `Accept-Language` is forwarded from the incoming client request to the
// backend so the upstream's i18n logic (backend spec 016 §4.1.1) sees the
// user's locale. We do NOT decide locale here — that lives at the edge.

import 'server-only'
import { z, type ZodType } from 'zod'

import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { ListQuery } from '@/lib/schemas/list'

import { backendFetch } from './backend'
import { createRoute } from './create-route'
import { okResponse } from './responses'

const PAGE_LIMIT = 10

interface BackendListShape<T> {
  items: T[]
  pageInfo: { nextCursor: string | null; hasMore: boolean }
}

export interface CreateListRouteOptions<TBackend, TClient> {
  /** Upstream backend path, e.g. `/v1/donation/charities`. */
  upstream: string
  /** Zod schema describing one item in the backend list response. */
  backendItemSchema: ZodType<TBackend>
  /**
   * Pure mapper from one backend item to the client-facing shape.
   * Should drop `createdAt` / `updatedAt`, optionally drop a null
   * `logoUrl` / `coverImageUrl`, and flatten inflated categories.
   */
  toClientItem: (item: TBackend) => TClient
}

export function createListRoute<TBackend, TClient>(
  opts: CreateListRouteOptions<TBackend, TClient>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  const responseSchema: ZodType<BackendListShape<TBackend>> = z.object({
    items: z.array(opts.backendItemSchema),
    pageInfo: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  })

  return createRoute({
    querySchema: ListQuery,
    handler: async ({ req, query, requestId }) => {
      const acceptLanguage = req.headers.get('accept-language') ?? undefined
      const { data } = await backendFetch<unknown>(opts.upstream, {
        query: {
          q: query.q,
          cursor: query.cursor,
          category: query.category,
          limit: PAGE_LIMIT,
        },
        headers: acceptLanguage ? { 'accept-language': acceptLanguage } : undefined,
        requestId,
      })

      const parsed = responseSchema.safeParse(data)
      if (!parsed.success) {
        throw new ContractViolationError(
          `Upstream ${opts.upstream} response failed schema: ${parsed.error.message}`,
        )
      }

      return okResponse({
        items: parsed.data.items.map(opts.toClientItem),
        nextCursor: parsed.data.pageInfo.nextCursor,
      })
    },
  })
}
