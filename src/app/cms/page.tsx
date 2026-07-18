import type { Metadata } from 'next'

import { requireAdminSession } from '@/lib/session/requireAdmin'
import { CmsHomeToast } from './CmsHomeToast'

export const metadata: Metadata = {
  title: 'CMS | StreamSight',
}

/**
 * Spec 013b §1 — CMS landing. Also the bounce target for admins who lack
 * SUPER_ADMIN rights when they hit /cms/admins
 * (requireSuperAdminSession → /cms?reason=not-super-admin).
 */
export default async function CmsHomePage() {
  const session = await requireAdminSession()
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 flex flex-col gap-3">
      <CmsHomeToast />
      <h1 className="text-xl font-semibold text-ink-AAA">
        歡迎，{session.user.name}
      </h1>
      <p className="text-sm text-ink-AA">
        使用左側導覽列前往各管理功能。
      </p>
    </main>
  )
}
