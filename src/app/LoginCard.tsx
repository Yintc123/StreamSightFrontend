'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from './auth/Field'

/**
 * Spec 005 — 首頁登入卡片
 *
 * 帳密欄位目前**僅做客端非空驗證**；送出時呼叫 POST /api/auth/login，BFF
 * 橋接 BE /auth/login + /auth/me → iron-session。成功 → /cms；失敗 → 顯示
 * inline 錯誤。
 *
 * 「建立帳號」按鈕純前端導航 → /register（spec 007 v0.2；目前 placeholder，
 * spec 已對齊 BE spec 008 v0.6 帳密註冊 contract，待 hook + BFF 實作）。
 */
export function LoginCard() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSubmit = username.length > 0 && password.length > 0 && !isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: username, password }),
        })
        if (!res.ok) {
          setError(`登入失敗 (HTTP ${res.status.toString()})`)
          return
        }
        router.push('/cms')
      } catch (e) {
        setError(`登入失敗：${e instanceof Error ? e.message : '網路錯誤'}`)
      }
    })
  }

  return (
    <section
      data-component="LoginCard"
      aria-labelledby="login-card-title"
      className="w-full max-w-[345px] mx-auto bg-surface-card rounded-2xl
                 shadow-sm border border-line p-5 flex flex-col gap-4"
    >
      <h2
        id="login-card-title"
        className="text-base font-semibold text-ink-AAA leading-6"
      >
        登入
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field
          id="login-username"
          label="帳號"
          type="text"
          autoComplete="username"
          value={username}
          onChange={setUsername}
        />
        <Field
          id="login-password"
          label="密碼"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {error && (
          <p
            role="alert"
            className="text-[13px] leading-5 text-danger"
          >
            {error}
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
          {isPending ? '登入中…' : '登入後台'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/register')}
          className="h-11 rounded-lg bg-surface-card border border-brand text-brand text-base font-medium leading-6
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
                     hover:bg-brand/5"
        >
          建立帳號
        </button>
      </form>
    </section>
  )
}

