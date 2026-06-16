// Spec 011a §6.2 — admin charity list + create BFF.

import 'server-only'

import { backendFetch } from '@/lib/api/backend'
import { createAdminRoute } from '@/lib/api/createAdminRoute'
import { okResponse } from '@/lib/api/responses'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { BackendAdminCharityDetail } from '@/lib/schemas/admin-detail'

import { CharityCreateBody } from './schemas'

export const POST = createAdminRoute({
  bodySchema: CharityCreateBody,
  handler: async ({ body, requestId }) => {
    const { data } = await backendFetch<unknown>(
      '/cms/donation/charities',
      { method: 'POST', body, requestId },
    )
    const parsed = BackendAdminCharityDetail.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream POST /cms/donation/charities response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})

// v0.1 fallback — BE 026 admin list endpoint not shipped yet. Forward to
// the user-side list which returns the public live subset. Switch the URL
// to `/cms/donation/charities` once BE 026 v0.1 ships; the wire shape only
// adds admin metadata fields so existing read paths keep working.
export const GET = createAdminRoute({
  handler: async ({ req, requestId }) => {
    const url = new URL(req.url)
    const limit = url.searchParams.get('limit') ?? '100'
    const qs = new URLSearchParams({ limit })
    const { data } = await backendFetch<unknown>(
      `/user/v1/donation/charities?${qs.toString()}`,
      { requestId },
    )
    return okResponse(data)
  },
})
