'use client'

// Spec 011 §5.1 / §5.2 — 建立 / 編輯使用者表單（靜態 UI）。
//
// 掛在既有 <BottomSheet> 上（§依賴 spec 003m）。建立與編輯共用同一份表單，
// 差別只在標題、初值、是否顯示「啟用狀態」toggle、送出按鈕文案。
//
// 靜態階段：驗證是輕量 client-side（email 格式 + name 必填），送出後把值
// 交回 UsersTable 改 local state；**不打 API**。等 §5.3 Zod schema
// (`src/lib/schemas/user.ts`) 落地後，改用同一份 schema 做 source of truth，
// 並在此接 §5.4 的 409「此 email 已被使用」inline 錯誤。

import { useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'

import type { CmsUser } from './mock-users'

export type UserFormValues = {
  name: string
  email: string
  isActive: boolean
}

type UserFormSheetProps = {
  open: boolean
  mode: 'create' | 'edit'
  initial: CmsUser | null
  onClose: () => void
  onSubmit: (values: UserFormValues) => void
}

const EMPTY: UserFormValues = { name: '', email: '', isActive: true }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function UserFormSheet({ open, mode, initial, onClose, onSubmit }: UserFormSheetProps) {
  return (
    <BottomSheet
      open={open}
      title={mode === 'edit' ? '編輯使用者' : '新增使用者'}
      onClose={onClose}
    >
      {/*
        用 key 讓表單「每次開啟 / 切換目標」都 remount → useState 以新 initial
        重新初始化，免掉 sync-state-in-effect 反模式（react-hooks/set-state-in-effect）。
        key 含 open：關閉再開同一列也會重置回原值、清掉未存的編輯。
      */}
      <UserFormBody
        key={`${mode}-${initial?.id ?? 'new'}-${open}`}
        mode={mode}
        initial={initial}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </BottomSheet>
  )
}

function UserFormBody({
  mode,
  initial,
  onClose,
  onSubmit,
}: Omit<UserFormSheetProps, 'open'>) {
  const [values, setValues] = useState<UserFormValues>(
    initial
      ? { name: initial.name, email: initial.email, isActive: initial.isActive }
      : EMPTY,
  )
  const [touched, setTouched] = useState(false)

  const nameError = values.name.trim() === '' ? '請輸入名稱' : ''
  const emailError =
    values.email.trim() === ''
      ? '請輸入 email'
      : !EMAIL_RE.test(values.email.trim())
        ? '請輸入有效的 email'
        : ''
  const valid = nameError === '' && emailError === ''

  function set<K extends keyof UserFormValues>(key: K, v: UserFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  function handleSubmit() {
    setTouched(true)
    if (!valid) return
    onSubmit({ ...values, name: values.name.trim(), email: values.email.trim() })
  }

  return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        className="flex flex-col gap-4 pb-2"
      >
        {/* 名稱 */}
        <FormField
          id="user-name"
          label="名稱"
          value={values.name}
          onChange={(v) => set('name', v)}
          error={touched ? nameError : ''}
          autoComplete="name"
        />

        {/* Email */}
        <FormField
          id="user-email"
          label="Email"
          type="email"
          value={values.email}
          onChange={(v) => set('email', v)}
          error={touched ? emailError : ''}
          autoComplete="email"
        />

        {/* 啟用狀態（僅編輯顯示；建立一律預設啟用）*/}
        {mode === 'edit' && (
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-page px-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-sm text-ink-AAA">啟用帳號</span>
              <span className="text-xs text-ink-A">停用後該使用者無法登入</span>
            </div>
            <Toggle
              checked={values.isActive}
              onChange={(v) => set('isActive', v)}
              label="啟用帳號"
            />
          </div>
        )}

        {/* 動作 */}
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
            disabled={touched && !valid}
            className="flex-1 h-11 rounded-lg bg-brand text-sm font-semibold text-ink-on-brand
                       hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {mode === 'edit' ? '儲存' : '建立'}
          </button>
        </div>
      </form>
  )
}

// ── 表單欄位（label + input + inline error）─────────────────
function FormField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: 'text' | 'email'
  autoComplete?: string
}) {
  const errId = `${id}-error`
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-[13px] leading-5 text-ink-AA">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={
          'h-10 px-3 rounded-lg bg-surface-page border text-sm text-ink-AAA placeholder:text-ink-A focus:outline-none focus:ring-1 ' +
          (error
            ? 'border-danger focus:border-danger focus:ring-danger'
            : 'border-line focus:border-brand focus:ring-brand')
        }
      />
      {error && (
        <span id={errId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  )
}

// ── 開關（switch）──────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
        (checked ? 'bg-brand' : 'bg-line')
      }
    >
      <span
        aria-hidden
        className={
          'absolute top-0.5 h-5 w-5 rounded-full bg-surface-card transition-transform ' +
          (checked ? 'translate-x-[22px]' : 'translate-x-0.5')
        }
      />
    </button>
  )
}
