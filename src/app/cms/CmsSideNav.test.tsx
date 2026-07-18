import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/cms/admins'),
}))

import { CmsSideNav } from './CmsSideNav'

describe('CmsSideNav 左欄（當前系統功能）', () => {
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
