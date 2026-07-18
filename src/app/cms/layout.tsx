// Spec 013b §1 / 016 §6 — CMS shell (RSC). Requires any admin session, then
// hands adminRole to CmsSideNav (conditionally reveals the SUPER_ADMIN entry)
// and the Streamlit base URL to CmsTopBar. Per-page gates
// (requireSuperAdminSession) remain the real boundary.

import type { ReactNode } from 'react'

import { env } from '@/lib/config'
import { requireAdminSession } from '@/lib/session/requireAdmin'
import { CmsTopBar } from './CmsTopBar'
import { CmsSideNav } from './CmsSideNav'

// Spec 016 §6 — 兩層導覽：頂部列切換系統（管理後台 / 資料平台），左欄顯示當前系統功能。
export default async function CmsLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession()
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <CmsTopBar
        name={session.user.name}
        streamlitBaseUrl={env.STREAMLIT_BASE_URL ?? ''}
      />
      <div className="flex-1 min-h-0 flex">
        <CmsSideNav adminRole={session.adminRole} />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  )
}
