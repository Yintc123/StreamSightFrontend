'use client'

// Spec 018 — 閒置 15 分鐘自動登出。
//
// 在登入後 CMS 區域監聽滑鼠 + 鍵盤活動,連續 15 分鐘無任何動作即
// 重用既有登出流程(getCsrfToken → POST /api/auth/logout)並硬導向
// `/?reason=idle-logout`(AuthRedirectToast 於首頁接住並提示)。
//
// 計時以「lastActivity 時間戳」為準(§3.2 D3):setTimeout fire 時二次
// 驗證,對瀏覽器背景節流免疫;visibilitychange 補喚醒即時檢查(D4);
// localStorage + storage 事件做跨分頁同步 / 跨 reload 保留(D5)。

import { useEffect, useRef } from 'react'
import { getCsrfToken } from '@/lib/client/csrf'

export const IDLE_STORAGE_KEY = 'streamsight:idle:last-activity'

const ACTIVITY_THROTTLE_MS = 1000
// 滑鼠 + 鍵盤(§3.1 D1)。全部 passive。
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'wheel', 'keydown'] as const

const DEFAULT_IDLE_MINUTES = 15

// 於函式內讀 env(而非模組頂層 const),讓測試的 vi.stubEnv 生效,
// 也讓 Next.js 對 NEXT_PUBLIC_* 的 build-time inline 正常運作。
function idleTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES
  const minutes = raw == null || raw === '' ? DEFAULT_IDLE_MINUTES : Number(raw)
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_IDLE_MINUTES * 60_000
  return minutes * 60_000
}

export function useIdleLogout(): void {
  const firedRef = useRef(false)
  const lastActivityRef = useRef(0) // effect mount 時以 Date.now() 初始化(避免 render 期呼叫)
  const lastWriteRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const timeoutMs = idleTimeoutMs()
    if (timeoutMs <= 0) return // NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0 → 停用(D2)

    function clearTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    async function logout() {
      if (firedRef.current) return
      firedRef.current = true
      clearTimer()
      try {
        const csrf = await getCsrfToken()
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        })
      } catch {
        // fail-safe:即使撤銷失敗仍導向首頁(§3.3 D7)
      }
      window.location.assign('/?reason=idle-logout')
    }

    // 以時間戳排程到 deadline;fire 時二次驗證(D3)。
    function schedule() {
      if (firedRef.current) return
      clearTimer()
      const remaining = lastActivityRef.current + timeoutMs - Date.now()
      if (remaining <= 0) {
        void logout()
        return
      }
      timerRef.current = setTimeout(() => {
        if (Date.now() - lastActivityRef.current >= timeoutMs) void logout()
        else schedule()
      }, remaining)
    }

    function markActive(at: number) {
      if (at > lastActivityRef.current) lastActivityRef.current = at
      schedule()
    }

    function onActivity() {
      const now = Date.now()
      if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return // 節流(D3)
      lastWriteRef.current = now
      try {
        localStorage.setItem(IDLE_STORAGE_KEY, String(now)) // 跨分頁 / 跨 reload(D5)
      } catch {
        // localStorage 不可用時退化為單分頁計時
      }
      markActive(now)
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== IDLE_STORAGE_KEY || !e.newValue) return
      const ts = Number(e.newValue)
      if (Number.isFinite(ts) && ts > lastActivityRef.current) markActive(ts) // 他分頁活動(D5)
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') schedule() // 喚醒即時檢查(D4)
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)

    lastActivityRef.current = Date.now()
    schedule() // 初始排程

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimer()
    }
  }, [])
}
