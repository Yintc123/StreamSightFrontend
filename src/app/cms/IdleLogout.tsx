'use client'

// Spec 018 — 僅在登入後 CMS 區域啟用閒置登出;不渲染任何內容。
// CmsLayout 已由 requireAdminSession() 保證此 subtree 內使用者已登入,
// 是唯一且理想的掛載點(D6)。

import { useIdleLogout } from '@/lib/hooks/useIdleLogout'

export function IdleLogout(): null {
  useIdleLogout()
  return null
}
