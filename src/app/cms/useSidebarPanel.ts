'use client'

// Spec 016 §4 / OQ-2 — CmsSideNav 的收合 + 寬度調整狀態（對齊 Streamlit 側欄）。
//
// 純邏輯抽離為 hook：clampWidth 夾住寬度範圍；useSidebarPanel 以 useSyncExternalStore
// 讀 localStorage（跨重新整理 / 跨分頁保留），收合態 / 寬度變更即寫回。用 external store
// 而非 useEffect+setState，避免 hydration 不一致與 react-hooks/set-state-in-effect。

import { useCallback, useSyncExternalStore } from 'react'

// 值取自 Streamlit 側欄實測（stSidebar computed style，2026-07-19）：
// width 256 / min-width 200 / max-width 600。
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 600
export const SIDEBAR_DEFAULT_WIDTH = 256
export const SIDEBAR_STORAGE_KEY = 'cms.sidebar'

/** 夾在 [min, max]、取整、防 NaN（NaN → 下限）。 */
export function clampWidth(
  px: number,
  min = SIDEBAR_MIN_WIDTH,
  max = SIDEBAR_MAX_WIDTH,
): number {
  if (Number.isNaN(px)) return min
  return Math.min(max, Math.max(min, Math.round(px)))
}

type PersistedState = { width: number; collapsed: boolean }

// ── external store：以 localStorage 原始字串為快照，變更時通知訂閱者 ──
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange) // 跨分頁同步
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function emit(): void {
  for (const cb of listeners) cb()
}

/** 回原始字串快照（primitive，供 useSyncExternalStore 以值比較，避免無限重繪）。 */
function getRawSnapshot(): string {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** SSR / 首次 client render 用預設（空字串）→ hydration 不 mismatch。 */
function getServerSnapshot(): string {
  return ''
}

function parse(raw: string): PersistedState {
  const fallback: PersistedState = {
    width: SIDEBAR_DEFAULT_WIDTH,
    collapsed: false,
  }
  if (!raw) return fallback
  try {
    const p = JSON.parse(raw) as Partial<PersistedState>
    return {
      width: clampWidth(Number(p.width ?? SIDEBAR_DEFAULT_WIDTH)),
      collapsed: Boolean(p.collapsed),
    }
  } catch {
    return fallback // 毀損 JSON → 安全退回預設
  }
}

function persist(state: PersistedState): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 不可用（隱私模式）→ 靜默略過
  }
  emit()
}

export interface SidebarPanel {
  collapsed: boolean
  width: number
  toggleCollapsed: () => void
  setWidth: (px: number) => void
}

export function useSidebarPanel(): SidebarPanel {
  const raw = useSyncExternalStore(subscribe, getRawSnapshot, getServerSnapshot)
  const { width, collapsed } = parse(raw)

  // callback 內即時重讀最新快照，避免 render 期閉包造成的 stale 狀態。
  const toggleCollapsed = useCallback(() => {
    const cur = parse(getRawSnapshot())
    persist({ width: cur.width, collapsed: !cur.collapsed })
  }, [])

  const setWidth = useCallback((px: number) => {
    const cur = parse(getRawSnapshot())
    persist({ width: clampWidth(px), collapsed: cur.collapsed })
  }, [])

  return { collapsed, width, toggleCollapsed, setWidth }
}
