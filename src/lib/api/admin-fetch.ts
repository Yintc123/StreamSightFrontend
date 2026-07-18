import 'server-only'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendAdminResponse,
  BackendAdminSummary,
  BackendAdminListResponse,
  adaptAdminResponse,
  adaptAdminSummary,
  adaptAdminList,
  type ClientAdmin,
  type ClientAdminSummary,
  type ClientAdminList,
} from '@/lib/schemas/admin'
import { BackendAdminMeResponse } from '@/lib/schemas/auth'

// Spec 013a §3.2 — validate the backend snake payload, then adapt to camel.
// A shape mismatch is contract drift → 502 (ContractViolationError), never a
// silent partial write.

function assertShape<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { message: string } } },
  raw: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ContractViolationError(`${label} response shape mismatch: ${parsed.error.message}`)
  }
  return parsed.data
}

export function parseAdminResponse(raw: unknown): ClientAdmin {
  return adaptAdminResponse(assertShape(BackendAdminResponse, raw, 'AdminResponse'))
}

export function parseAdminSummary(raw: unknown): ClientAdminSummary {
  return adaptAdminSummary(assertShape(BackendAdminSummary, raw, 'AdminSummary'))
}

export function parseAdminList(raw: unknown): ClientAdminList {
  return adaptAdminList(assertShape(BackendAdminListResponse, raw, 'AdminListResponse'))
}

export function parseAdminMe(raw: unknown): ClientAdmin {
  const me = assertShape(BackendAdminMeResponse, raw, 'AdminResponse (/admin/me)')
  return { id: me.id, username: me.username, name: me.name, adminRole: me.admin_role }
}
