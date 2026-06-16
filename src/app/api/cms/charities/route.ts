// Spec 011a §6.2 — admin charity list + create BFF.

import 'server-only'

import { backendFetch } from '@/lib/api/backend'
import { createAdminRoute } from '@/lib/api/createAdminRoute'
import { okResponse } from '@/lib/api/responses'

import { CharityCreateBody } from './schemas'

export const POST = createAdminRoute({
  bodySchema: CharityCreateBody,
  // Pass-through response — BE 020 §5.1.1 declares
  // `response: { 201: CharityDetail }`, which is the *public* shape and
  // intentionally strips the five admin lifecycle fields (displayOrder /
  // publishStartAt / publishEndAt / archivedAt / deletedAt). FE doesn't
  // read this response (form router.replaces back to the list and the
  // next render comes from GET admin detail anyway), so Zod-gating with
  // BackendAdminCharityDetail would 502 on every successful create even
  // though BE persisted the row correctly.
  handler: async ({ body, requestId, session }) => {
    const { data } = await backendFetch<unknown>(
      '/cms/donation/charities',
      { method: 'POST', body, requestId, session },
    )
    return okResponse(data)
  },
})

// Spec 011a §6.2 + BE 026 §5.1.1 — admin list. Forwards to BE admin
// endpoint which caps limit at 100; bypasses Redis cache (BE 026 §2.4).
export const GET = createAdminRoute({
  handler: async ({ req, requestId, session }) => {
    const url = new URL(req.url)
    const requested = Number(url.searchParams.get('limit') ?? '100')
    const limit = Math.min(Math.max(1, requested || 100), 100)
    const qs = new URLSearchParams({ limit: String(limit) })
    // Optional admin filters (BE 026 §5.1.1): includeArchived / includeDeleted
    for (const k of ['includeArchived', 'includeDeleted'] as const) {
      const v = url.searchParams.get(k)
      if (v !== null) qs.set(k, v)
    }
    const { data } = await backendFetch<unknown>(
      `/cms/donation/charities?${qs.toString()}`,
      { requestId, session },
    )
    return okResponse(data)
  },
})
