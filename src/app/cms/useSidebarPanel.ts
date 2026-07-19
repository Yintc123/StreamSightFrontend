'use client'

// Spec 016 §4 / 019 — CmsSideNav 的收合 + 寬度調整狀態（對齊 Streamlit 側欄）。
//
// 儲存拆分（019 §3.2）：寬度走 `sidebar_width` cookie（與 Streamlit 端共用，契約
// 019 §3.1）；收合態留 localStorage['cms.sidebar']（無共用對象、保跨分頁即時同步）。
// 讀取優先序（019 §3.4）：cookie → legacy localStorage width → 預設 256。
//
// 純邏輯抽離為 hook：clampWidth 夾住寬度範圍；useSidebarPanel 以 useSyncExternalStore
// 讀複合快照（cookie 抽值 + localStorage 原始值，019 §3.3）。用 external store 而非
// useEffect+setState，避免 hydration 不一致與 react-hooks/set-state-in-effect。

import { useCallback, useSyncExternalStore } from 'react'

import {
  buildSidebarWidthCookieString,
  parseSidebarWidthCookie,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './sidebarCookie'

export { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH }

// 預設值取自 Streamlit 側欄實測（stSidebar computed style，2026-07-19）。
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

// localStorage 持久化形狀：collapsed 為現役欄位；width 為 legacy 欄位（019 前的
// 儲存位置），只讀作退路、寫回時保留不清（§I-4），不再更新。
type PersistedState = { width?: number; collapsed: boolean }

// ── external store：複合快照（cookie 寬度 + localStorage 原始值），變更時通知訂閱者 ──
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange) // 跨分頁同步（collapsed）
  window.addEventListener('focus', onChange) // 切回分頁時重讀 cookie（019 §3.3）
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
    window.removeEventListener('focus', onChange)
  }
}

function emit(): void {
  for (const cb of listeners) cb()
}

function getLocalRaw(): string {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** cookie 中的合法寬度（缺省 / 非法 / 越界 → ''），只含 sidebar_width 一值：
 *  無關 cookie（如 theme）變動不產生新快照（019 §3.3）。 */
function getCookieWidthRaw(): string {
  try {
    return String(parseSidebarWidthCookie(document.cookie) ?? '')
  } catch {
    return ''
  }
}

/** 回複合 primitive 快照（供 useSyncExternalStore 以值比較，避免無限重繪）。 */
function getRawSnapshot(): string {
  return `${getCookieWidthRaw()}|${getLocalRaw()}`
}

/** SSR / 首次 client render 用預設（空字串）→ hydration 不 mismatch。 */
function getServerSnapshot(): string {
  return ''
}

function parseLocal(raw: string): PersistedState {
  if (!raw) return { collapsed: false }
  try {
    const p = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...(typeof p.width === 'number' ? { width: clampWidth(p.width) } : {}),
      collapsed: Boolean(p.collapsed),
    }
  } catch {
    return { collapsed: false } // 毀損 JSON → 安全退回預設
  }
}

function parseSnapshot(snapshot: string): { width: number; collapsed: boolean } {
  const sep = snapshot.indexOf('|')
  const cookieRaw = sep >= 0 ? snapshot.slice(0, sep) : ''
  const local = parseLocal(sep >= 0 ? snapshot.slice(sep + 1) : '')
  return {
    // 優先序（019 §3.4）：① cookie → ② legacy width → ③ 預設
    width: cookieRaw
      ? Number.parseInt(cookieRaw, 10)
      : (local.width ?? SIDEBAR_DEFAULT_WIDTH),
    collapsed: local.collapsed,
  }
}

/** 是否已表態過收合偏好（019 §I-2）；legacy { width }-only、毀損、缺 key → false。 */
export function hasCollapsedPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (!raw) return false
    const p = JSON.parse(raw) as Partial<PersistedState>
    return typeof p.collapsed === 'boolean'
  } catch {
    return false
  }
}

function persistWidth(px: number): void {
  try {
    document.cookie = buildSidebarWidthCookieString(
      clampWidth(px),
      process.env.NODE_ENV === 'production',
    )
  } catch {
    // cookie 不可寫（受限環境）→ 靜默略過
  }
  emit()
}

function persistCollapsed(collapsed: boolean): void {
  try {
    // §I-4：合併保留 legacy width 欄位，收合不得斷掉 cookie 缺省時的讀取退路。
    const legacy = parseLocal(getLocalRaw())
    const next: PersistedState =
      legacy.width !== undefined ? { width: legacy.width, collapsed } : { collapsed }
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next))
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
  const snapshot = useSyncExternalStore(subscribe, getRawSnapshot, getServerSnapshot)
  const { width, collapsed } = parseSnapshot(snapshot)

  // callback 內即時重讀最新快照，避免 render 期閉包造成的 stale 狀態。
  const toggleCollapsed = useCallback(() => {
    persistCollapsed(!parseSnapshot(getRawSnapshot()).collapsed)
  }, [])

  const setWidth = useCallback((px: number) => {
    persistWidth(px)
  }, [])

  return { collapsed, width, toggleCollapsed, setWidth }
}
