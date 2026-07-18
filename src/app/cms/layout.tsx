// Spec 013b §1 — CMS shell (RSC). Requires any admin session, then hands the
// session's adminRole to CmsNav so it can conditionally reveal the SUPER_ADMIN
// entry. Per-page gates (requireSuperAdminSession) remain the real boundary.

import type { ReactNode } from 'react'

import { requireAdminSession } from '@/lib/session/requireAdmin'
import { CmsNav } from './CmsNav'

export default async function CmsLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession()
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <CmsNav adminRole={session.adminRole} name={session.user.name} />
      {children}
    </div>
  )
}
