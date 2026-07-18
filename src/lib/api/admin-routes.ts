import 'server-only'
import { z } from 'zod'

import { createRoute } from './create-route'
import { createAdminRoute } from './create-admin-route'
import { okResponse } from './responses'
import { backendFetch } from './backend'
import { getSessionService } from '@/lib/session/service'
import {
  AdminListQuery,
  AdminCreateInput,
  AdminUpdateInput,
  AdminRoleInput,
  ChangePasswordInput,
  toBackendAdminCreate,
  toBackendRoleUpdate,
  toBackendPasswordChange,
} from '@/lib/schemas/admin'
import {
  parseAdminResponse,
  parseAdminSummary,
  parseAdminList,
  parseAdminMe,
} from './admin-fetch'

// Spec 013a §3.2 — BFF routes for admin management. Camel outward, snake to
// the backend. `/api/cms/admins*` are SUPER_ADMIN-only (createAdminRoute);
// `/api/cms/me*` are self-service for any authenticated admin (createRoute).

const IdParam = z.object({ id: z.coerce.number().int().positive() })
type IdParam = z.infer<typeof IdParam>

const NO_STORE = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
} as const

function createdResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ data }), { status: 201, headers: NO_STORE })
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store, private' } })
}

// ─── /api/cms/admins ───────────────────────────────────────────────

export const adminListRoute = createAdminRoute<undefined, AdminListQuery>({
  querySchema: AdminListQuery,
  handler: async ({ query, session, requestId }) => {
    const { data } = await backendFetch<unknown>('/admin/admins', {
      query: { status: query.status, limit: query.limit, offset: query.offset },
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminList(data))
  },
})

export const adminCreateRoute = createAdminRoute<AdminCreateInput>({
  bodySchema: AdminCreateInput,
  handler: async ({ body, session, requestId }) => {
    const { data } = await backendFetch<unknown>('/admin/admins', {
      method: 'POST',
      body: toBackendAdminCreate(body),
      session,
      requestId,
      passClientErrors: true,
    })
    return createdResponse(parseAdminResponse(data))
  },
})

// ─── /api/cms/admins/[id] ──────────────────────────────────────────

export const adminDetailRoute = createAdminRoute<undefined, undefined, IdParam>({
  paramsSchema: IdParam,
  handler: async ({ params, session, requestId }) => {
    const { data } = await backendFetch<unknown>(`/admin/admins/${params.id}`, {
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminSummary(data))
  },
})

export const adminRenameRoute = createAdminRoute<AdminUpdateInput, undefined, IdParam>({
  paramsSchema: IdParam,
  bodySchema: AdminUpdateInput,
  handler: async ({ params, body, session, requestId }) => {
    const { data } = await backendFetch<unknown>(`/admin/admins/${params.id}`, {
      method: 'PATCH',
      body: { name: body.name },
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminResponse(data))
  },
})

export const adminDeleteRoute = createAdminRoute<undefined, undefined, IdParam>({
  paramsSchema: IdParam,
  handler: async ({ params, session, requestId }) => {
    // Soft delete — backend returns the updated summary (spec 013a §1).
    const { data } = await backendFetch<unknown>(`/admin/admins/${params.id}`, {
      method: 'DELETE',
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminSummary(data))
  },
})

// ─── /api/cms/admins/[id]/role ─────────────────────────────────────

export const adminRoleRoute = createAdminRoute<AdminRoleInput, undefined, IdParam>({
  paramsSchema: IdParam,
  bodySchema: AdminRoleInput,
  handler: async ({ params, body, session, requestId }) => {
    const { data } = await backendFetch<unknown>(`/admin/admins/${params.id}/role`, {
      method: 'PUT',
      body: toBackendRoleUpdate(body),
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminResponse(data))
  },
})

// ─── lifecycle POST actions (archive / unarchive / restore) ────────

export function makeLifecyclePost(action: 'archive' | 'unarchive' | 'restore') {
  return createAdminRoute<undefined, undefined, IdParam>({
    paramsSchema: IdParam,
    handler: async ({ params, session, requestId }) => {
      const { data } = await backendFetch<unknown>(
        `/admin/admins/${params.id}/${action}`,
        { method: 'POST', session, requestId, passClientErrors: true },
      )
      return okResponse(parseAdminSummary(data))
    },
  })
}

// ─── /api/cms/me (self-service, any authenticated admin) ───────────

export const cmsMeRoute = createRoute<undefined, undefined, undefined, true>({
  requireAuth: true,
  handler: async ({ session, requestId }) => {
    const { data } = await backendFetch<unknown>('/admin/me', {
      session,
      requestId,
      passClientErrors: true,
    })
    return okResponse(parseAdminMe(data))
  },
})

export const cmsMePasswordRoute = createRoute<ChangePasswordInput, undefined, undefined, true>({
  requireAuth: true,
  bodySchema: ChangePasswordInput,
  handler: async ({ body, session, requestId }) => {
    await backendFetch<unknown>('/admin/me/password', {
      method: 'POST',
      body: toBackendPasswordChange(body),
      session,
      requestId,
      passClientErrors: true,
    })
    // Backend revoked every refresh token (spec 013a §5). Kill the BFF session
    // so the dead refresh token can't be replayed; client redirects to login.
    await getSessionService().destroy().catch(() => {})
    return noContent()
  },
})
