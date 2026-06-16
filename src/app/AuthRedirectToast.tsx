'use client'

// Spec 010 §3.3 — surfaces a toast when an auth gate (proxy or RSC)
// redirects the user back to `/` with `?reason=cms-auth`. Mounted on
// the homepage (`src/app/page.tsx`), renders nothing to the DOM.
//
// After firing once, strips the query via `router.replace('/')` so
// page refresh doesn't re-toast. Sonner's `id` upsert means the
// redundant React-19 strict-mode double-render in dev still shows
// exactly one toast.

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

const REASON_PARAM = 'reason'
const CMS_AUTH_REASON = 'cms-auth'

export const CMS_AUTH_TOAST_ID = 'cms-auth-required'
export const CMS_AUTH_TOAST_MESSAGE = '無使用 cms 權限'
export const CMS_AUTH_TOAST_DURATION_MS = 4000

export function AuthRedirectToast() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get(REASON_PARAM)

  useEffect(() => {
    if (reason !== CMS_AUTH_REASON) return
    toast.error(CMS_AUTH_TOAST_MESSAGE, {
      id: CMS_AUTH_TOAST_ID,
      duration: CMS_AUTH_TOAST_DURATION_MS,
    })
    router.replace('/')
  }, [reason, router])

  return null
}
