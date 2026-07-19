'use client'

// Spec 010 §3.3 + spec 011 §3.5 — surfaces a toast when an auth gate
// (proxy or RSC) redirects the user back to `/` with `?reason=…`.
// Mounted on the homepage (`src/app/page.tsx`), renders nothing.
//
// After firing once, strips the query via `router.replace('/')` so a
// refresh doesn't re-toast. Sonner's `id` upsert means the redundant
// React-19 strict-mode double-render in dev still shows one toast.

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

const REASON_PARAM = 'reason'

const CMS_AUTH_REASON = 'cms-auth'
const CMS_NOT_ADMIN_REASON = 'cms-not-admin'
// Spec 018 §5.5 — idle timeout hard-redirect lands here.
const IDLE_LOGOUT_REASON = 'idle-logout'

export const CMS_AUTH_TOAST_ID = 'cms-auth-required'
export const CMS_AUTH_TOAST_MESSAGE = '無使用 cms 權限'
export const CMS_AUTH_TOAST_DURATION_MS = 4000

export const CMS_NOT_ADMIN_TOAST_ID = 'cms-not-admin'
export const CMS_NOT_ADMIN_TOAST_MESSAGE = '需要管理員權限'

export const IDLE_LOGOUT_TOAST_ID = 'idle-logout'
export const IDLE_LOGOUT_TOAST_MESSAGE = '閒置過久,已自動登出'

type ToastSpec = { id: string; message: string }

const REASONS: Record<string, ToastSpec> = {
  [CMS_AUTH_REASON]: {
    id: CMS_AUTH_TOAST_ID,
    message: CMS_AUTH_TOAST_MESSAGE,
  },
  [CMS_NOT_ADMIN_REASON]: {
    id: CMS_NOT_ADMIN_TOAST_ID,
    message: CMS_NOT_ADMIN_TOAST_MESSAGE,
  },
  [IDLE_LOGOUT_REASON]: {
    id: IDLE_LOGOUT_TOAST_ID,
    message: IDLE_LOGOUT_TOAST_MESSAGE,
  },
}

export function AuthRedirectToast() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get(REASON_PARAM)

  useEffect(() => {
    if (!reason) return
    const spec = REASONS[reason]
    if (!spec) return
    toast.error(spec.message, {
      id: spec.id,
      duration: CMS_AUTH_TOAST_DURATION_MS,
    })
    router.replace('/')
  }, [reason, router])

  return null
}
