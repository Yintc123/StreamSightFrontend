import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/mocks/server'

const { pushMock, getCsrfTokenMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getCsrfTokenMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/cms'),
  useRouter: vi.fn().mockReturnValue({ push: pushMock }),
}))
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: getCsrfTokenMock }))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <button aria-label="theme-toggle">T</button>,
}))

import { CmsNav } from './CmsNav'

function setup(
  props: {
    adminRole?: 'super_admin' | 'editor' | 'viewer'
    streamlitBaseUrl?: string
  } = {},
) {
  render(
    <CmsNav
      name="Alice"
      adminRole={props.adminRole}
      streamlitBaseUrl={props.streamlitBaseUrl ?? 'https://streamlit.example'}
    />,
  )
}

beforeEach(() => {
  pushMock.mockReset()
  getCsrfTokenMock.mockReset()
  toast.error.mockReset()
  toast.success.mockReset()
})

describe('CmsNav 登出按鈕', () => {
  it('顯示登出按鈕', () => {
    setup()
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument()
  })

  it('點擊登出 → 取 csrf → POST /api/auth/logout 帶 X-CSRF-Token → router.push("/")', async () => {
    getCsrfTokenMock.mockResolvedValue('tok-abc')
    let capturedHeader: string | null = null
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        capturedHeader = request.headers.get('x-csrf-token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setup()

    fireEvent.click(screen.getByRole('button', { name: '登出' }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'))
    expect(getCsrfTokenMock).toHaveBeenCalledOnce()
    expect(capturedHeader).toBe('tok-abc')
  })

  it('fetch 拋出例外 → toast.error，不 redirect', async () => {
    getCsrfTokenMock.mockResolvedValue('tok-abc')
    server.use(
      http.post('/api/auth/logout', () => HttpResponse.error()),
    )
    setup()

    fireEvent.click(screen.getByRole('button', { name: '登出' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('登出失敗，請重試'))
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('HTTP 非 2xx → toast.error，不 redirect', async () => {
    getCsrfTokenMock.mockResolvedValue('tok-abc')
    server.use(
      http.post('/api/auth/logout', () => new HttpResponse(null, { status: 403 })),
    )
    setup()

    fireEvent.click(screen.getByRole('button', { name: '登出' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('登出失敗，請重試'))
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('CmsNav 側邊欄導覽項目', () => {
  it('super_admin：最上為「管理員管理」→ /cms/admins，第二為「設定」→ /cms/settings', () => {
    setup({ adminRole: 'super_admin' })
    const admins = screen.getByRole('link', { name: '管理員管理' })
    const settings = screen.getByRole('link', { name: '設定' })
    expect(admins).toHaveAttribute('href', '/cms/admins')
    expect(settings).toHaveAttribute('href', '/cms/settings')
  })

  it('非 super_admin：不顯示「管理員管理」，仍顯示「設定」', () => {
    setup({ adminRole: 'editor' })
    expect(screen.queryByRole('link', { name: '管理員管理' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '設定' })).toBeInTheDocument()
  })

  it('顯示 5 個 Streamlit 外部連結，href 指向 streamlitBaseUrl', () => {
    setup({ streamlitBaseUrl: 'https://streamlit.example' })
    expect(screen.getByRole('link', { name: '儀表板' })).toHaveAttribute(
      'href',
      'https://streamlit.example',
    )
    expect(screen.getByRole('link', { name: '資料管理' })).toHaveAttribute(
      'href',
      'https://streamlit.example/data_management',
    )
    expect(screen.getByRole('link', { name: '即時監控' })).toHaveAttribute(
      'href',
      'https://streamlit.example/realtime_monitor',
    )
    expect(screen.getByRole('link', { name: '資料分析' })).toHaveAttribute(
      'href',
      'https://streamlit.example/analytics',
    )
    expect(screen.getByRole('link', { name: '系統管理' })).toHaveAttribute(
      'href',
      'https://streamlit.example/admin',
    )
  })

  it('streamlitBaseUrl 為空時，Streamlit 連結退回根相對路徑', () => {
    setup({ streamlitBaseUrl: '' })
    expect(screen.getByRole('link', { name: '儀表板' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '資料管理' })).toHaveAttribute(
      'href',
      '/data_management',
    )
  })

  it('順序：管理員管理 → 設定 → 儀表板 → 資料管理 → 即時監控 → 資料分析 → 系統管理', () => {
    setup({ adminRole: 'super_admin' })
    const labels = screen
      .getAllByRole('link')
      .map((el) => el.textContent)
      .filter((t) =>
        [
          '管理員管理',
          '設定',
          '儀表板',
          '資料管理',
          '即時監控',
          '資料分析',
          '系統管理',
        ].includes(t ?? ''),
      )
    expect(labels).toEqual([
      '管理員管理',
      '設定',
      '儀表板',
      '資料管理',
      '即時監控',
      '資料分析',
      '系統管理',
    ])
  })
})
