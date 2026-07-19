// Spec 013a §4 — Admin management Zod contracts + snake↔camel adapters.
//
// The backend `/admin/admins*` + `/admin/me*` endpoints speak snake_case;
// the BFF exposes camelCase to the browser. All timestamps stay as the
// backend ISO strings (spec 013a §3.2 — formatting is a UI concern), matching
// the spec 011 BackendUserResponse convention.

import { z } from 'zod'
import { AdminRole, AdminRoleWire, toAdminRoleRank } from './auth'

export { AdminRole }

// ─── Field bounds (client pre-flight; backend is authoritative) ────

const AdminUsername = z.string().trim().min(1).max(100)
const AdminName = z.string().trim().min(1).max(100)
const AdminPassword = z.string().min(8).max(128)

// ─── Inbound (client + BFF) — camelCase ────────────────────────────

/** GET /admin/admins query (status filter + pagination). */
export const AdminListQuery = z.object({
  status: z.enum(['active', 'archived', 'deleted', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type AdminListQuery = z.infer<typeof AdminListQuery>

export const AdminCreateInput = z.object({
  username: AdminUsername,
  name: AdminName,
  password: AdminPassword,
  adminRole: AdminRole.default('viewer'),
})
export type AdminCreateInput = z.infer<typeof AdminCreateInput>

export const AdminUpdateInput = z.object({ name: AdminName })
export type AdminUpdateInput = z.infer<typeof AdminUpdateInput>

export const AdminRoleInput = z.object({ adminRole: z.enum(['super_admin', 'editor', 'viewer']) })
export type AdminRoleInput = z.infer<typeof AdminRoleInput>

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: AdminPassword,
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>

// ─── Backend response validators — snake_case ──────────────────────

export const BackendAdminResponse = z.object({
  id: z.number().int(),
  username: z.string(),
  name: z.string(),
  admin_role: AdminRoleWire, // int rank on the wire → internal string
})
export type BackendAdminResponse = z.infer<typeof BackendAdminResponse>

export const BackendAdminSummary = BackendAdminResponse.extend({
  is_protected: z.boolean(),
  is_active: z.boolean(),
  archived_at: z.string().nullable(),
  archived_by: z.number().int().nullable(),
  archived_by_username: z.string().nullable(),
  deleted_at: z.string().nullable(),
  deleted_by: z.number().int().nullable(),
  deleted_by_username: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type BackendAdminSummary = z.infer<typeof BackendAdminSummary>

export const BackendAdminListResponse = z.object({
  items: z.array(BackendAdminSummary),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
export type BackendAdminListResponse = z.infer<typeof BackendAdminListResponse>

// ─── Client-facing camel types ─────────────────────────────────────

export type ClientAdmin = {
  id: number
  username: string
  name: string
  adminRole: AdminRole
}

export type ClientAdminSummary = ClientAdmin & {
  isProtected: boolean
  isActive: boolean
  archivedAt: string | null
  archivedBy: number | null
  archivedByUsername: string | null
  deletedAt: string | null
  deletedBy: number | null
  deletedByUsername: string | null
  createdAt: string
  updatedAt: string
}

export type ClientAdminList = {
  items: ClientAdminSummary[]
  total: number
  limit: number
  offset: number
}

// ─── Adapters snake → camel ────────────────────────────────────────

export function adaptAdminResponse(raw: BackendAdminResponse): ClientAdmin {
  return {
    id: raw.id,
    username: raw.username,
    name: raw.name,
    adminRole: raw.admin_role,
  }
}

export function adaptAdminSummary(raw: BackendAdminSummary): ClientAdminSummary {
  return {
    id: raw.id,
    username: raw.username,
    name: raw.name,
    adminRole: raw.admin_role,
    isProtected: raw.is_protected,
    isActive: raw.is_active,
    archivedAt: raw.archived_at,
    archivedBy: raw.archived_by,
    archivedByUsername: raw.archived_by_username,
    deletedAt: raw.deleted_at,
    deletedBy: raw.deleted_by,
    deletedByUsername: raw.deleted_by_username,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export function adaptAdminList(raw: BackendAdminListResponse): ClientAdminList {
  return {
    items: raw.items.map(adaptAdminSummary),
    total: raw.total,
    limit: raw.limit,
    offset: raw.offset,
  }
}

// ─── Outbound camel → snake (BFF → backend request bodies) ─────────

export function toBackendAdminCreate(input: AdminCreateInput) {
  return {
    username: input.username,
    name: input.name,
    password: input.password,
    admin_role: toAdminRoleRank(input.adminRole), // string → wire int rank
  }
}

export function toBackendRoleUpdate(input: AdminRoleInput) {
  return { admin_role: toAdminRoleRank(input.adminRole) }
}

export function toBackendPasswordChange(input: ChangePasswordInput) {
  return { current_password: input.currentPassword, new_password: input.newPassword }
}
