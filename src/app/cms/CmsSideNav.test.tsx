import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/cms/admins'),
}))

import { CmsSideNav } from './CmsSideNav'
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_STORAGE_KEY } from './useSidebarPanel'
import { SIDEBAR_COOKIE } from './sidebarCookie'

/** 清掉 sidebar_width cookie（019 §I-5），避免寬度在測試間洩漏。 */
function clearSidebarCookie() {
  document.cookie = `${SIDEBAR_COOKIE}=; Max-Age=0; Path=/`
}

describe('CmsSideNav 左欄（當前系統功能）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearSidebarCookie()
  })

  it('super_admin：顯示「管理員管理」→ /cms/admins、「設定」→ /cms/settings', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    expect(screen.getByRole('link', { name: '管理員管理' })).toHaveAttribute(
      'href',
      '/cms/admins',
    )
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/cms/settings')
  })

  it('非 super_admin：不顯示「管理員管理」，仍顯示「設定」', () => {
    render(<CmsSideNav adminRole="editor" />)
    expect(screen.queryByRole('link', { name: '管理員管理' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '設定' })).toBeInTheDocument()
  })

  it('不含 Streamlit 頁面連結（那 5 頁屬「資料平台」自身左欄）', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    expect(screen.queryByRole('link', { name: '儀表板' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '資料管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '系統管理' })).not.toBeInTheDocument()
  })
})

describe('CmsSideNav 收合 / 展開（對齊 Streamlit）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearSidebarCookie()
  })

  afterEach(() => {
    // 確保 innerWidth 不洩漏到其他 case
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('點「收合側欄」→ 連結隱藏、改顯「展開側欄」鈕', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    fireEvent.click(screen.getByRole('button', { name: '收合側欄' }))

    expect(screen.queryByRole('link', { name: '設定' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展開側欄' })).toBeInTheDocument()
  })

  it('收合後點「展開側欄」→ 連結重新出現', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    fireEvent.click(screen.getByRole('button', { name: '收合側欄' }))
    fireEvent.click(screen.getByRole('button', { name: '展開側欄' }))

    expect(screen.getByRole('link', { name: '設定' })).toBeInTheDocument()
  })

  it('窄螢幕（< 768px）且無 localStorage → 掛載後自動收合', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    render(<CmsSideNav adminRole="super_admin" />)
    expect(screen.getByRole('button', { name: '展開側欄' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '設定' })).not.toBeInTheDocument()
  })

  it('窄螢幕且只有 legacy width 記錄（無 collapsed 欄位）→ 仍自動收合（019 §I-2）', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ width: 300 }))
    render(<CmsSideNav adminRole="super_admin" />)
    // 拖過寬度不代表表態過收合偏好，窄螢幕仍應自動收合
    expect(screen.getByRole('button', { name: '展開側欄' })).toBeInTheDocument()
  })

  it('窄螢幕但已有 localStorage → 不覆寫使用者偏好', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: SIDEBAR_DEFAULT_WIDTH, collapsed: false }),
    )
    render(<CmsSideNav adminRole="super_admin" />)
    // 使用者明確設定展開，respect it
    expect(screen.getByRole('button', { name: '收合側欄' })).toBeInTheDocument()
  })

  it('持久化：localStorage 標記 collapsed → 掛載即為收合態', () => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: SIDEBAR_DEFAULT_WIDTH, collapsed: true }),
    )
    render(<CmsSideNav adminRole="super_admin" />)

    expect(screen.getByRole('button', { name: '展開側欄' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '設定' })).not.toBeInTheDocument()
  })
})

describe('CmsSideNav 寬度調整把手（鍵盤可及）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearSidebarCookie()
  })

  it('提供 vertical separator，預設 aria-valuenow = 預設寬', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    const handle = screen.getByRole('separator', { name: '調整側欄寬度' })
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', String(SIDEBAR_DEFAULT_WIDTH))
  })

  it('ArrowRight 加寬、ArrowLeft 縮窄（更新 aria-valuenow）', () => {
    render(<CmsSideNav adminRole="super_admin" />)
    const handle = screen.getByRole('separator', { name: '調整側欄寬度' })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(SIDEBAR_DEFAULT_WIDTH)

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(SIDEBAR_DEFAULT_WIDTH)
  })
})
