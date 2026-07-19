// Spec 018 — 閒置 15 分鐘自動登出。
//
// 時間戳為準的計時(§3.2 D3),故測試用 fake timers 同時假 Date,
// 讓 Date.now() 隨 advanceTimersByTime 前進。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(() => Promise.resolve('csrf-abc')),
}))

import { getCsrfToken } from '@/lib/client/csrf'
import { useIdleLogout, IDLE_STORAGE_KEY } from './useIdleLogout'

const IDLE_MS = 15 * 60 * 1000

let assignMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  assignMock = vi.fn()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))
  // happy-dom 不允許真實 location.assign 跳轉,改用 stub。
  vi.stubGlobal('location', { assign: assignMock, href: '/' } as unknown as Location)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('useIdleLogout', () => {
  it('連續 15 分鐘無活動 → 登出並硬導向 /?reason=idle-logout', async () => {
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS + 1000)

    expect(getCsrfToken).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': 'csrf-abc' },
      }),
    )
    expect(assignMock).toHaveBeenCalledWith('/?reason=idle-logout')
  })

  it('滑鼠/鍵盤活動重置計時 → 不登出', async () => {
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    window.dispatchEvent(new Event('mousemove'))
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000) // 距上次活動未滿 15 分

    expect(assignMock).not.toHaveBeenCalled()
  })

  it('keydown 也算活動', async () => {
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)

    expect(assignMock).not.toHaveBeenCalled()
  })

  it('逾時只觸發一次登出', async () => {
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS * 3)

    expect(assignMock).toHaveBeenCalledTimes(1)
    expect(getCsrfToken).toHaveBeenCalledTimes(1)
  })

  it('其他分頁活動(storage 事件,較新時間戳)重置本分頁計時', async () => {
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    const fresher = String(Date.now())
    window.dispatchEvent(
      new StorageEvent('storage', { key: IDLE_STORAGE_KEY, newValue: fresher }),
    )
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)

    expect(assignMock).not.toHaveBeenCalled()
  })

  it('分頁由隱藏轉可見時,若已逾時立即登出(涵蓋睡眠喚醒,timer 未 fire)', async () => {
    let visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })

    renderHook(() => useIdleLogout())

    // 跳系統時間但「不執行」pending timer(模擬背景/睡眠時 setTimeout 被凍結)。
    // 相對跳:此設定下 fake timers 不歸零,Date.now() 從真實 epoch 起算。
    vi.setSystemTime(Date.now() + IDLE_MS + 5000)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1)

    expect(assignMock).toHaveBeenCalledWith('/?reason=idle-logout')
  })

  it('NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0 → 停用,永不登出', async () => {
    vi.stubEnv('NEXT_PUBLIC_IDLE_LOGOUT_MINUTES', '0')
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS * 2)

    expect(assignMock).not.toHaveBeenCalled()
  })

  it('logout API 失敗仍 fail-safe 導向首頁', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderHook(() => useIdleLogout())

    await vi.advanceTimersByTimeAsync(IDLE_MS + 1000)

    expect(assignMock).toHaveBeenCalledWith('/?reason=idle-logout')
  })
})
