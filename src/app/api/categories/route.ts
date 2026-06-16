// Spec 002 §3 / backend 016 §6 — categories dictionary BFF.
// Upstream: GET /user/v1/donation/categories (BE spec 023 §2.4)
//
// No pagination, no query params, no transformation. We pass the upstream
// body through after Zod validation so a contract drift (e.g. backend adds
// a new key the client doesn't know) surfaces as ContractViolationError
// instead of silently leaking junk through `okResponse`.

import 'server-only'

import { backendFetch } from '@/lib/api/backend'
import { createRoute } from '@/lib/api/create-route'
import { okResponse } from '@/lib/api/responses'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { BackendCategoryListResponse } from '@/lib/schemas/categories'

export const GET = createRoute({
  handler: async ({ req, requestId }) => {
    const acceptLanguage = req.headers.get('accept-language') ?? undefined
    const { data } = await backendFetch<unknown>('/user/v1/donation/categories', {
      headers: acceptLanguage ? { 'accept-language': acceptLanguage } : undefined,
      requestId,
    })
    const parsed = BackendCategoryListResponse.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream /user/v1/donation/categories response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})
