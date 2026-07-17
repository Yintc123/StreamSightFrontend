'use client'

// Spec 007 v0.2 §3, §4, §5 — public register form.
//
// Mirrors LoginCard structure: three inputs (username / password /
// passwordConfirm), useTransition for the submit, fetch the BFF route at
// /api/auth/register, route on outcome. CSRF: register is csrfExempt
// (no existing session for the registrant yet), so the form does NOT
// send X-CSRF-Token; the BFF still gates on Origin via verifyCsrf.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Field } from '../auth/Field'
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_REGEX,
} from '@/lib/schemas/auth'

const USERNAME_RULE_MSG = '帳號需為 3–30 個英數字、底線或連字號'
const PASSWORD_MIN_MSG = '密碼至少 8 個字元'
const PASSWORD_MAX_MSG = '密碼最多 256 字元'
const PASSWORD_MISMATCH_MSG = '兩次密碼輸入不一致'
const USERNAME_TAKEN_MSG = '帳號已被使用'
const RATE_LIMITED_MSG = '嘗試次數過多，請稍後再試'
const GENERIC_FAIL_MSG = '註冊失敗，請稍後再試'

function deriveUsernameError(value: string): string | null {
  if (value.length === 0) return null
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) {
    return USERNAME_RULE_MSG
  }
  if (!USERNAME_REGEX.test(value)) return USERNAME_RULE_MSG
  return null
}

function derivePasswordError(value: string): string | null {
  if (value.length === 0) return null
  if (value.length < PASSWORD_MIN) return PASSWORD_MIN_MSG
  if (value.length > PASSWORD_MAX) return PASSWORD_MAX_MSG
  return null
}

function deriveConfirmError(password: string, confirm: string): string | null {
  if (confirm.length === 0) return null
  if (password !== confirm) return PASSWORD_MISMATCH_MSG
  return null
}

export function RegisterCard() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  // Server-derived errors (BFF responses): kept separate from validation
  // derivation so a stale 409 message clears the moment the user edits
  // the offending field.
  const [serverUsernameError, setServerUsernameError] = useState<string | null>(
    null,
  )
  const [serverFormError, setServerFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const usernameError =
    serverUsernameError ?? deriveUsernameError(username)
  const passwordError = derivePasswordError(password)
  const confirmError = deriveConfirmError(password, confirm)

  const allFilled =
    username.length > 0 && password.length > 0 && confirm.length > 0
  const noErrors = !usernameError && !passwordError && !confirmError
  const canSubmit = allFilled && noErrors && !isPending

  const handleUsernameChange = (v: string) => {
    setUsername(v)
    if (serverUsernameError) setServerUsernameError(null)
    if (serverFormError) setServerFormError(null)
  }

  const handlePasswordChange = (v: string) => {
    setPassword(v)
    if (serverFormError) setServerFormError(null)
  }

  const handleConfirmChange = (v: string) => {
    setConfirm(v)
    if (serverFormError) setServerFormError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setServerUsernameError(null)
    setServerFormError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (res.ok) {
          router.push('/cms')
          return
        }
        if (res.status === 409) {
          setServerUsernameError(USERNAME_TAKEN_MSG)
          return
        }
        if (res.status === 429) {
          setServerFormError(RATE_LIMITED_MSG)
          return
        }
        if (res.status === 400) {
          // BE / BFF validation message — surface verbatim so users see
          // the rule that tripped (BFF passes message through).
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          setServerFormError(
            body?.error?.message ?? GENERIC_FAIL_MSG,
          )
          return
        }
        setServerFormError(GENERIC_FAIL_MSG)
      } catch {
        setServerFormError(GENERIC_FAIL_MSG)
      }
    })
  }

  return (
    <section
      data-component="RegisterCard"
      aria-labelledby="register-card-title"
      className="w-full max-w-[345px] mx-auto bg-surface-card rounded-2xl
                 shadow-sm border border-line p-5 flex flex-col gap-4"
    >
      <h2
        id="register-card-title"
        className="text-base font-semibold text-ink-AAA leading-6"
      >
        建立帳號
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1">
          <Field
            id="register-username"
            label="帳號"
            type="text"
            autoComplete="username"
            value={username}
            onChange={handleUsernameChange}
            describedById={usernameError ? 'register-username-error' : undefined}
          />
          {usernameError && (
            <p
              id="register-username-error"
              role="alert"
              className="text-[13px] leading-5 text-danger"
            >
              {usernameError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Field
            id="register-password"
            label="密碼"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={handlePasswordChange}
            describedById={passwordError ? 'register-password-error' : undefined}
          />
          {passwordError && (
            <p
              id="register-password-error"
              role="alert"
              className="text-[13px] leading-5 text-danger"
            >
              {passwordError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Field
            id="register-confirm"
            label="確認密碼"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={handleConfirmChange}
            describedById={confirmError ? 'register-confirm-error' : undefined}
          />
          {confirmError && (
            <p
              id="register-confirm-error"
              role="alert"
              className="text-[13px] leading-5 text-danger"
            >
              {confirmError}
            </p>
          )}
        </div>
        {serverFormError && (
          <p
            role="alert"
            className="text-[13px] leading-5 text-danger"
          >
            {serverFormError}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-11 rounded-lg bg-brand text-ink-on-brand text-base font-semibold leading-6
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
                     hover:bg-brand-400"
        >
          {isPending ? '註冊中…' : '註冊'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="h-11 rounded-lg bg-surface-card border border-brand text-brand text-base font-medium leading-6
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
                     hover:bg-brand/5"
        >
          我已有帳號
        </button>
      </form>
    </section>
  )
}
