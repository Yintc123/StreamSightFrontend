import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginCard } from './LoginCard'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

describe('LoginCard', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('渲染 username + password 兩個 input', () => {
    render(<LoginCard />)
    expect(screen.getByLabelText('帳號')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
  })

  it('渲染「登入後台」+「建立帳號」兩顆按鈕', () => {
    render(<LoginCard />)
    expect(screen.getByRole('button', { name: '登入後台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立帳號' })).toBeInTheDocument()
  })

  it('username 為空 → 登入按鈕 disabled', () => {
    render(<LoginCard />)
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw' } })
    expect(screen.getByRole('button', { name: '登入後台' })).toBeDisabled()
  })

  it('password 為空 → 登入按鈕 disabled', () => {
    render(<LoginCard />)
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u' } })
    expect(screen.getByRole('button', { name: '登入後台' })).toBeDisabled()
  })

  it('兩欄都有值 → 登入按鈕 enabled', () => {
    render(<LoginCard />)
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw' } })
    expect(screen.getByRole('button', { name: '登入後台' })).toBeEnabled()
  })

  it('登入成功 → POST /api/dev/login + 跳 /cms', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginCard />)
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: '登入後台' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/dev/login', expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/cms'))
  })

  it('登入失敗 → 顯示錯誤訊息、不跳轉', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginCard />)
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: '登入後台' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('登入失敗'),
    )
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('「建立帳號」按鈕 → 跳 /register（spec 007 v0.2；不打 API）', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LoginCard />)
    fireEvent.click(screen.getByRole('button', { name: '建立帳號' }))
    expect(routerPushMock).toHaveBeenCalledWith('/register')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
