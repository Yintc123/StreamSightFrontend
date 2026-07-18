'use client'

// Surfaces the `?reason=not-super-admin` bounce (requireSuperAdminSession)
// as a toast on the CMS landing page.

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export function CmsHomeToast() {
  const params = useSearchParams()
  const reason = params.get('reason')
  useEffect(() => {
    if (reason === 'not-super-admin') {
      toast.error('需要 SUPER_ADMIN 權限才能管理管理員', { id: 'not-super-admin' })
    }
  }, [reason])
  return null
}
