// Spec 013b §1 / 016 §6 — CMS shell (RSC). Requires any admin session, then
// hands adminRole to CmsSideNav (conditionally reveals the SUPER_ADMIN entry)
// and the Streamlit base URL to CmsTopBar. Per-page gates
// (requireSuperAdminSession) remain the real boundary.

import type { ReactNode } from 'react'
import { cookies } from 'next/headers'

import { env } from '@/lib/config'
import { requireAdminSession } from '@/lib/session/requireAdmin'
import { CmsTopBar } from './CmsTopBar'
import { CmsSideNav } from './CmsSideNav'
import { IdleLogout } from './IdleLogout'
import { parseSidebarWidthValue, SIDEBAR_COOKIE } from './sidebarCookie'

// Spec 016 §6 — 兩層導覽：頂部列切換系統（管理後台 / 資料平台），左欄顯示當前系統功能。
export default async function CmsLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession()
  // 019 §3.5 — SSR 直出側欄寬：first paint 即 cookie 寬，免 hydration 後跳動。
  // layout 本就因 session 動態渲染，讀 cookie 無額外代價。
  const sidebarWidth = parseSidebarWidthValue(
    (await cookies()).get(SIDEBAR_COOKIE)?.value,
  )
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      {/* Spec 018 — 閒置 15 分鐘自動登出（僅登入後區域）。 */}
      <IdleLogout />
      <CmsTopBar
        name={session.user.name}
        streamlitBaseUrl={env.STREAMLIT_BASE_URL ?? ''}
      />
      <div className="flex-1 min-h-0 flex">
        <CmsSideNav adminRole={session.adminRole} initialWidth={sidebarWidth} />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  )
}
