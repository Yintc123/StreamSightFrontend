import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import {
  clampWidth,
  useSidebarPanel,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_STORAGE_KEY,
} from './useSidebarPanel'

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

describe('useSidebarPanel（收合 / 寬度 + localStorage 持久化）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('無持久化資料 → 預設展開、預設寬度', () => {
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('讀取既有 localStorage → 還原 width 與 collapsed', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 300, collapsed: true }),
    )
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.width).toBe(300)
    expect(result.current.collapsed).toBe(true)
  })

  it('toggleCollapsed → 反轉並寫回 localStorage', () => {
    const { result } = renderHook(() => useSidebarPanel())
    act(() => result.current.toggleCollapsed())
    expect(result.current.collapsed).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)!).collapsed).toBe(true)
  })

  it('setWidth → 夾住範圍並寫回 localStorage', () => {
    const { result } = renderHook(() => useSidebarPanel())
    act(() => result.current.setWidth(9999))
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH)
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)!).width).toBe(
      SIDEBAR_MAX_WIDTH,
    )
  })

  it('毀損的 localStorage 值 → 安全退回預設，不丟例外', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, '{ not json')
    const { result } = renderHook(() => useSidebarPanel())
    expect(result.current.collapsed).toBe(false)
    expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH)
  })
})
