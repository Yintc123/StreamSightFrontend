import type { Metadata } from 'next'

import { requireSuperAdminSession } from '@/lib/session/requireAdmin'
import { AdminsTable } from './AdminsTable'

export const metadata: Metadata = {
  title: '管理員管理 | StreamSight',
}

/**
 * Spec 013b §2 — `/cms/admins`. SUPER_ADMIN-only (RSC gate); the client
 * `AdminsTable` fetches the list via TanStack Query.
 */
export default async function CmsAdminsPage() {
  await requireSuperAdminSession()
  return <AdminsTable />
}
