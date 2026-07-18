'use client'

// Spec 013a §3/§5 — client fetchers for the admin-management BFF. Mutations
// fetch a CSRF token first (getCsrfToken; already exists — do not re-create).
// A non-2xx response throws CmsHttpError carrying the status + parsed body so
// components can branch (409 → inline "帳號已被使用", 422 → toast BE message).

import { getCsrfToken } from '@/lib/client/csrf'
import type {
  AdminListQuery,
  ClientAdmin,
  ClientAdminList,
  ClientAdminSummary,
  AdminCreateInput,
  AdminRole,
} from '@/lib/schemas/admin'

export class CmsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'CmsHttpError'
  }
}

async function readError(res: Response): Promise<CmsHttpError> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null
  return new CmsHttpError(
    res.status,
    body?.error?.code ?? null,
    body?.error?.message ?? `請求失敗 (HTTP ${res.status})`,
  )
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw await readError(res)
  const body = (await res.json()) as { data: T }
  return body.data
}

async function mutate<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T | null> {
  const csrfToken = await getCsrfToken()
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrfToken,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw await readError(res)
  if (res.status === 204) return null
  const parsed = (await res.json()) as { data: T }
  return parsed.data
}

export function fetchAdmins(status: AdminListQuery['status']): Promise<ClientAdminList> {
  const params = new URLSearchParams({ status, limit: '200', offset: '0' })
  return getJson<ClientAdminList>(`/api/cms/admins?${params.toString()}`)
}

export function fetchMe(): Promise<ClientAdmin> {
  return getJson<ClientAdmin>('/api/cms/me')
}

export function createAdmin(input: AdminCreateInput): Promise<ClientAdmin | null> {
  return mutate<ClientAdmin>('/api/cms/admins', 'POST', input)
}

export function renameAdmin(id: number, name: string): Promise<ClientAdmin | null> {
  return mutate<ClientAdmin>(`/api/cms/admins/${id}`, 'PATCH', { name })
}

export function changeRole(id: number, adminRole: AdminRole): Promise<ClientAdmin | null> {
  return mutate<ClientAdmin>(`/api/cms/admins/${id}/role`, 'PUT', { adminRole })
}

export function archiveAdmin(id: number): Promise<ClientAdminSummary | null> {
  return mutate<ClientAdminSummary>(`/api/cms/admins/${id}/archive`, 'POST')
}

export function unarchiveAdmin(id: number): Promise<ClientAdminSummary | null> {
  return mutate<ClientAdminSummary>(`/api/cms/admins/${id}/unarchive`, 'POST')
}

export function deleteAdmin(id: number): Promise<ClientAdminSummary | null> {
  return mutate<ClientAdminSummary>(`/api/cms/admins/${id}`, 'DELETE')
}

export function restoreAdmin(id: number): Promise<ClientAdminSummary | null> {
  return mutate<ClientAdminSummary>(`/api/cms/admins/${id}/restore`, 'POST')
}

export function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<null> {
  return mutate<null>('/api/cms/me/password', 'POST', {
    currentPassword,
    newPassword,
  }).then(() => null)
}
