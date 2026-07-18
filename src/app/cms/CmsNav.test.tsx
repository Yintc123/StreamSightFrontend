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

function setup(props: { adminRole?: 'super_admin' | 'editor' | 'viewer' } = {}) {
  render(<CmsNav name="Alice" adminRole={props.adminRole} />)
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
