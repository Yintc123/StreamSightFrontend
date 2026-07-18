import type { ClientAdminSummary } from '@/lib/schemas/admin'

// Spec 013a §1.2 / 013b §2.1 — per-row action availability. These are UX
// affordances only; the backend 422/403 stays authoritative. Deriving them in
// one pure, tested function keeps the table dumb and the rules verifiable.

export type AdminStatus = 'active' | 'archived' | 'deleted'

export type AdminRowActions = {
  status: AdminStatus
  isSelf: boolean
  isProtected: boolean
  /** show a "root · 不可移除" marker */
  rootLabel: boolean
  /** super_admin (non-root): archive/delete hidden until demoted */
  mustDemoteFirst: boolean
  canRename: boolean
  canChangeRole: boolean
  canArchive: boolean
  canUnarchive: boolean
  canDelete: boolean
  canRestore: boolean
}

export function adminStatus(row: ClientAdminSummary): AdminStatus {
  if (row.deletedAt) return 'deleted'
  if (row.archivedAt || !row.isActive) return 'archived'
  return 'active'
}

export function adminRowActions(
  row: ClientAdminSummary,
  myAdminId: number | null,
): AdminRowActions {
  const status = adminStatus(row)
  const isSelf = myAdminId != null && row.id === myAdminId
  const isProtected = row.isProtected
  const isSuperAdmin = row.adminRole === 'super_admin'
  const active = status === 'active'

  // Protected root: locked entirely. Self: no dangerous ops on yourself.
  // super_admin (non-root): must be demoted before archive/delete (backend 422).
  const mustDemoteFirst = isSuperAdmin && !isProtected && active && !isSelf

  const canChangeRole = active && !isProtected && !isSelf
  const canRename = status !== 'deleted' && !isProtected

  const canArchive =
    active && !isProtected && !isSelf && !isSuperAdmin
  const canUnarchive = status === 'archived'
  const canDelete =
    active && !isProtected && !isSelf && !isSuperAdmin
  const canRestore = status === 'deleted'

  return {
    status,
    isSelf,
    isProtected,
    rootLabel: isProtected,
    mustDemoteFirst,
    canRename,
    canChangeRole,
    canArchive,
    canUnarchive,
    canDelete,
    canRestore,
  }
}
