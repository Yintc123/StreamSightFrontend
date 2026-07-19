import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import {
  clampWidth,
  hasCollapsedPreference,
  useSidebarPanel,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_STORAGE_KEY,
} from './useSidebarPanel'
import { SIDEBAR_COOKIE } from './sidebarCookie'

/** 清掉 sidebar_width cookie（§I-5，同 ThemeProvider.test.tsx pattern）。 */
function clearSidebarCookie() {
  document.cookie = `${SIDEBAR_COOKIE}=; Max-Age=0; Path=/`
}

describe('clampWidth（純函式：夾在 min/max、取整、防 NaN）', () => {
  it('低於下限 → 回下限', () => {
    expect(clampWidth(50)).toBe(SIDEBAR_MIN_WIDTH)
  })
  it('高於上限 → 回上限', () => {
    expect(clampWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
  })
  it('範圍內 → 四捨五入取整', () => {
    expect(clampWidth(240.6)).toBe(241)
  })
  it('NaN → 回下限（防呆）', () => {
    expect(clampWidth(Number.NaN)).toBe(SIDEBAR_MIN_WIDTH)
  })
})

describe('hasCollapsedPreference（auto-collapse 判斷依據，§I-2）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('含 boolean collapsed 欄位 → true', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ collapsed: false }),
    )
    expect(hasCollapsedPreference()).toBe(true)
  })

  it('缺 key → false', () => {
    expect(hasCollapsedPreference()).toBe(false)
  })

  it('毀損 JSON → false', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '{ not json')
    expect(hasCollapsedPreference()).toBe(false)
  })

  it('legacy { width }-only 記錄 → false（拖過寬度不代表表態過收合）', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 300 }),
    )
    expect(hasCollapsedPreference()).toBe(false)
  })
})

describe('useSidebarPanel（寬度走 sidebar_width cookie、收合走 localStorage）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearSidebarCookie()
  })

  it('無持久化資料 → 預設展開、預設寬度', () => {
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('讀取既有 cookie → 還原寬度（優先序 ①）', () => {
    document.cookie = `${SIDEBAR_COOKIE}=320; Path=/`
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(320)
  })

  it('cookie 缺省 → 退 legacy localStorage width（優先序 ②）', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 300, collapsed: true }),
    )
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(300)
    expect(result.current.collapsed).toBe(true)
  })

  it('cookie 勝過 legacy width（① > ②）', () => {
    document.cookie = `${SIDEBAR_COOKIE}=480; Path=/`
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 300, collapsed: false }),
    )
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(480)
  })

  it('setWidth → 夾住範圍、寫 cookie、不寫 localStorage', () => {
    const { result } = renderHook(() => useSidebarPanel())
    act(() => result.current.setWidth(9999))
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH)
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=${SIDEBAR_MAX_WIDTH}`)
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull()
  })

  it('toggleCollapsed → 反轉並寫回 localStorage', () => {
    const { result } = renderHook(() => useSidebarPanel())
    act(() => result.current.toggleCollapsed())
    expect(result.current.collapsed).toBe(true)
    expect(
      JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)!).collapsed,
    ).toBe(true)
  })

  it('toggleCollapsed 保留 legacy width 欄位（§I-4：收合不得斷掉遷移退路）', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 300, collapsed: false }),
    )
    const { result } = renderHook(() => useSidebarPanel())
    act(() => result.current.toggleCollapsed())
    expect(
      JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)!).width,
    ).toBe(300)
    // 收合後重新掛載（模擬下次載入）→ 寬度仍走退路 ②，不跳回預設
    const { result: remounted } = renderHook(() => useSidebarPanel())
    expect(remounted.current.width).toBe(300)
    expect(remounted.current.collapsed).toBe(true)
  })

  it('毀損 cookie 值（越界）→ 走退路，不丟例外', () => {
    document.cookie = `${SIDEBAR_COOKIE}=9999; Path=/`
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('毀損的 localStorage 值 → 安全退回預設，不丟例外', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '{ not json')
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('focus 事件 → 重讀 cookie（模擬他分頁 / Streamlit 改寬後切回）', () => {
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
    act(() => {
      document.cookie = `${SIDEBAR_COOKIE}=400; Path=/`
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current.width).toBe(400)
  })
})
