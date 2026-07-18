// Spec 013b §1 — CMS shell (RSC). Requires any admin session, then hands the
// session's adminRole to CmsNav so it can conditionally reveal the SUPER_ADMIN
// entry. Per-page gates (requireSuperAdminSession) remain the real boundary.

import type { ReactNode } from 'react'

import { env } from '@/lib/config'
import { requireAdminSession } from '@/lib/session/requireAdmin'
import { CmsNav } from './CmsNav'

export default async function CmsLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession()
  return (
    <div className="min-h-dvh bg-surface-page flex">
      <CmsNav
        adminRole={session.adminRole}
        name={session.user.name}
        streamlitBaseUrl={env.STREAMLIT_BASE_URL ?? ''}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  )
}
