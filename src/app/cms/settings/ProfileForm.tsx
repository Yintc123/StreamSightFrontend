'use client'

// Spec 013b §2.5 — change own password. On success (204) the backend has
// revoked all refresh tokens and the BFF destroyed the session, so the client
// redirects to the login page and prompts a re-login.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { FormField } from '@/components/ui/FormField'
import { PASSWORD_MIN } from '@/lib/schemas/auth'
import { changeOwnPassword, CmsHttpError } from '../admins/api'

export function ProfileForm() {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const nextError =
    next.length > 0 && next.length < PASSWORD_MIN ? `密碼至少 ${PASSWORD_MIN} 個字元` : undefined
  const confirmError =
    confirm.length > 0 && confirm !== next ? '兩次輸入的密碼不一致' : undefined
  const canSubmit =
    current.length > 0 &&
    next.length >= PASSWORD_MIN &&
    confirm === next &&
    !isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!canSubmit) return
    startTransition(async () => {
      try {
        await changeOwnPassword(current, next)
        toast.success('密碼已更新，請重新登入')
        router.push('/')
      } catch (err) {
        setFormError(err instanceof CmsHttpError ? err.message : '更新失敗，請稍後再試')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <FormField
        id="current-password"
        label="目前密碼"
        type="password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <FormField
        id="new-password"
        label="新密碼"
        type="password"
        value={next}
        onChange={setNext}
        error={nextError}
        autoComplete="new-password"
      />
      <FormField
        id="confirm-password"
        label="確認新密碼"
        type="password"
        value={confirm}
        onChange={setConfirm}
        error={confirmError}
        autoComplete="new-password"
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="h-11 rounded-lg bg-brand text-sm font-semibold text-ink-on-brand
                   disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-400
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {isPending ? '更新中…' : '更新密碼'}
      </button>
    </form>
  )
}
