'use client'

// Spec 013b §2.2 — create / rename admin sheet. Create collects
// username+name+password+role; rename edits only `name` (username read-only,
// role handled by AdminRoleControl). Client validation is pre-flight UX;
// server 409 (username taken) surfaces inline, other failures form-level.

import { useState, useTransition } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { FormField } from '@/components/ui/FormField'
import { PASSWORD_MIN } from '@/lib/schemas/auth'
import type { AdminRole, ClientAdmin } from '@/lib/schemas/admin'
import { createAdmin, renameAdmin, CmsHttpError } from './api'

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'viewer', label: 'Viewer（唯讀）' },
  { value: 'editor', label: 'Editor（編輯）' },
  { value: 'super_admin', label: 'Super Admin（管理員）' },
]

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  initial: ClientAdmin | null
  onClose: () => void
  onSuccess: () => void
}

export function AdminFormSheet({ open, mode, initial, onClose, onSuccess }: Props) {
  return (
    <BottomSheet
      open={open}
      title={mode === 'create' ? '新增管理員' : '編輯管理員'}
      onClose={onClose}
    >
      <FormBody
        key={`${mode}-${initial?.id ?? 'new'}-${open}`}
        mode={mode}
        initial={initial}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </BottomSheet>
  )
}

function FormBody({ mode, initial, onClose, onSuccess }: Omit<Props, 'open'>) {
  const isCreate = mode === 'create'
  const [username, setUsername] = useState(initial?.username ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [password, setPassword] = useState('')
  const [adminRole, setAdminRole] = useState<AdminRole>(initial?.adminRole ?? 'viewer')

  const [touched, setTouched] = useState(false)
  const [serverUsernameError, setServerUsernameError] = useState<string | null>(null)
  const [serverFormError, setServerFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Client-side format check kept intentionally minimal/safe (never stricter
  // than the backend): empty or whitespace only. Any richer format rule (e.g.
  // charset) is the backend's call and surfaces via a 400 mapped to this field.
  // Format errors (non-empty but malformed) show immediately, like password;
  // the "empty" hint waits for a submit attempt (touched).
  const usernameFormatError =
    isCreate && username.trim().length > 0 && /\s/.test(username)
      ? '帳號不可包含空白'
      : undefined
  const usernameEmptyError =
    isCreate && touched && username.trim().length === 0 ? '請輸入帳號' : undefined
  const usernameError = serverUsernameError ?? usernameFormatError ?? usernameEmptyError
  const nameError = touched && name.trim().length === 0 ? '請輸入顯示名稱' : undefined
  const passwordError =
    isCreate && password.length > 0 && password.length < PASSWORD_MIN
      ? `密碼至少 ${PASSWORD_MIN} 個字元`
      : undefined

  const allFilled = isCreate
    ? username.trim() && name.trim() && password.length >= PASSWORD_MIN
    : name.trim().length > 0
  const canSubmit =
    Boolean(allFilled) &&
    !usernameFormatError &&
    !serverUsernameError &&
    name.trim().length > 0 &&
    !isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerFormError(null)
    // Client-side blocks before hitting the API.
    if (isCreate && usernameFormatError) return
    if (isCreate && password.length > 0 && password.length < PASSWORD_MIN) return
    if (!canSubmit) return

    startTransition(async () => {
      try {
        if (isCreate) {
          await createAdmin({ username: username.trim(), name: name.trim(), password, adminRole })
        } else {
          await renameAdmin(initial!.id, name.trim())
        }
        onSuccess()
      } catch (err) {
        if (err instanceof CmsHttpError) {
          // 409 (taken) and, on create, 400 (username format — 013a §1.2) are
          // username-scoped → inline on the field. Everything else is
          // form-level.
          if (err.status === 409) {
            setServerUsernameError('帳號已被使用')
            return
          }
          if (isCreate && err.status === 400) {
            setServerUsernameError(err.message)
            return
          }
          setServerFormError(err.message)
          return
        }
        setServerFormError('操作失敗，請稍後再試')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-2">
      <FormField
        id="admin-username"
        label="帳號"
        value={username}
        onChange={(v) => {
          setUsername(v)
          setServerUsernameError(null)
        }}
        error={usernameError}
        autoComplete="off"
        readOnly={!isCreate}
      />
      <FormField
        id="admin-name"
        label="顯示名稱"
        value={name}
        onChange={setName}
        error={nameError}
        autoComplete="off"
      />
      {isCreate && (
        <>
          <FormField
            id="admin-password"
            label="密碼"
            type="password"
            value={password}
            onChange={setPassword}
            error={passwordError}
            autoComplete="new-password"
          />
          <label htmlFor="admin-role" className="flex flex-col gap-1">
            <span className="text-[13px] text-ink-AA">權限</span>
            <select
              id="admin-role"
              value={adminRole}
              onChange={(e) => setAdminRole(e.target.value as AdminRole)}
              className="h-10 rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA
                         focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {serverFormError && (
        <p role="alert" className="text-sm text-danger">
          {serverFormError}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border border-line text-sm font-medium text-ink-AA
                     hover:text-ink-AAA focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 h-11 rounded-lg bg-brand text-sm font-semibold text-ink-on-brand
                     disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-400
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {isPending ? '處理中…' : isCreate ? '建立' : '儲存'}
        </button>
      </div>
    </form>
  )
}
