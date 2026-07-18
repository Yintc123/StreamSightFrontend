import type { Metadata } from 'next'

import { requireAdminSession } from '@/lib/session/requireAdmin'
import { ProfileForm } from './ProfileForm'

export const metadata: Metadata = {
  title: '設定 | StreamSight',
}

/**
 * Spec 013b §2.5 — self-service settings. Open to any authenticated admin
 * (editor / viewer included); currently just change-own-password.
 */
export default async function CmsSettingsPage() {
  await requireAdminSession()
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink-AAA">帳號設定</h1>
        <p className="text-sm text-ink-A">變更你自己的密碼。更新後需重新登入。</p>
      </div>
      <ProfileForm />
    </main>
  )
}
