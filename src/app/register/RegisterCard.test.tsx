// Spec 007 v0.2 §7.1 — RegisterCard tests.
//
// TDD strict scope: this is the public register form, so client-side
// validation, submit gating, and BFF error code mapping (inline strings)
// are all pinned by tests.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

import { RegisterCard } from './RegisterCard'

const VALID_USERNAME = 'alice_01'
const VALID_PASSWORD = 'hunter2hunter'

function fillForm({
  username = VALID_USERNAME,
  password = VALID_PASSWORD,
  confirm = VALID_PASSWORD,
}: { username?: string; password?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText('帳號'), {
    target: { value: username },
  })
  fireEvent.change(screen.getByLabelText('密碼'), {
    target: { value: password },
  })
  fireEvent.change(screen.getByLabelText('確認密碼'), {
    target: { value: confirm },
  })
}

beforeEach(() => {
  pushMock.mockReset()
  replaceMock.mockReset()
  toastErrorMock.mockReset()
})

describe('<RegisterCard />', () => {
  it('1: 渲染三欄 + 兩顆按鈕', () => {
    render(<RegisterCard />)
    expect(screen.getByLabelText('帳號')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
    expect(screen.getByLabelText('確認密碼')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '註冊' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '我已有帳號' }),
    ).toBeInTheDocument()
  })

  it('2: 任一欄空 → 註冊 disabled', () => {
    render(<RegisterCard />)
    const submit = screen.getByRole('button', { name: '註冊' })
    expect(submit).toBeDisabled()

    fillForm({ password: '', confirm: '' })
    expect(submit).toBeDisabled()

    fillForm({ confirm: '' })
    expect(submit).toBeDisabled()
  })

  it('3: password 7 字 → disabled + inline「密碼至少 8 個字元」', () => {
    render(<RegisterCard />)
    fillForm({ password: 'short77', confirm: 'short77' })
    expect(screen.getByRole('button', { name: '註冊' })).toBeDisabled()
    expect(screen.getByText('密碼至少 8 個字元')).toBeInTheDocument()
  })

  it('4: password ≠ confirm → disabled + inline「兩次密碼輸入不一致」', () => {
    render(<RegisterCard />)
    fillForm({ confirm: 'differentpw1' })
    expect(screen.getByRole('button', { name: '註冊' })).toBeDisabled()
    expect(screen.getByText('兩次密碼輸入不一致')).toBeInTheDocument()
  })

  it('5: username 含中文 → disabled + inline 規則提示', () => {
    render(<RegisterCard />)
    fillForm({ username: '小明123' })
    expect(screen.getByRole('button', { name: '註冊' })).toBeDisabled()
    expect(
      screen.getByText('帳號需為 3–30 個英數字、底線或連字號'),
    ).toBeInTheDocument()
  })

  it('5b: username 31 字 → disabled + inline 上限提示', () => {
    render(<RegisterCard />)
    fillForm({ username: 'a'.repeat(31) })
    expect(screen.getByRole('button', { name: '註冊' })).toBeDisabled()
    expect(
      screen.getByText('帳號需為 3–30 個英數字、底線或連字號'),
    ).toBeInTheDocument()
  })

  it('5c: password 257 字 → disabled + inline「密碼最多 256 字元」', () => {
    render(<RegisterCard />)
    const longPw = 'a'.repeat(257)
    fillForm({ password: longPw, confirm: longPw })
    expect(screen.getByRole('button', { name: '註冊' })).toBeDisabled()
    expect(screen.getByText('密碼最多 256 字元')).toBeInTheDocument()
  })

  it('6: happy path → POST /api/auth/register + push("/cms")', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { sessionId: 's', csrfToken: 'c' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    render(<RegisterCard />)
    fillForm()
    await userEvent.click(screen.getByRole('button', { name: '註冊' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/auth/register')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      username: VALID_USERNAME,
      password: VALID_PASSWORD,
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/cms')
    })
    fetchSpy.mockRestore()
  })

  it('7: 409 AUTH_USERNAME_TAKEN → inline「帳號已被使用」、不 push', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'BACKEND_CLIENT_ERROR', message: 'taken' } }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    )
    render(<RegisterCard />)
    fillForm()
    await userEvent.click(screen.getByRole('button', { name: '註冊' }))
    await waitFor(() => {
      expect(screen.getByText('帳號已被使用')).toBeInTheDocument()
    })
    expect(pushMock).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('7b: 429 AUTH_RATE_LIMITED → inline 提示、不 push、按鈕仍 enabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'BACKEND_CLIENT_ERROR', message: 'slow' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    )
    render(<RegisterCard />)
    fillForm()
    await userEvent.click(screen.getByRole('button', { name: '註冊' }))
    await waitFor(() => {
      expect(screen.getByText('嘗試次數過多，請稍後再試')).toBeInTheDocument()
    })
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '註冊' })).not.toBeDisabled()
    fetchSpy.mockRestore()
  })

  it('8: 5xx → inline「註冊失敗」', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'BACKEND_UPSTREAM_ERROR' } }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    )
    render(<RegisterCard />)
    fillForm()
    await userEvent.click(screen.getByRole('button', { name: '註冊' }))
    await waitFor(() => {
      expect(screen.getByText(/註冊失敗/)).toBeInTheDocument()
    })
    expect(pushMock).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('9: 「我已有帳號」→ push("/")、不打 API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<RegisterCard />)
    await userEvent.click(screen.getByRole('button', { name: '我已有帳號' }))
    expect(pushMock).toHaveBeenCalledWith('/')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('10: in-flight → 按鈕文字「註冊中…」、disabled', async () => {
    let resolve!: (r: Response) => void
    const pending = new Promise<Response>((r) => {
      resolve = r
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending)
    render(<RegisterCard />)
    fillForm()
    await userEvent.click(screen.getByRole('button', { name: '註冊' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '註冊中…' })).toBeDisabled()
    })
    resolve(
      new Response(JSON.stringify({ data: {} }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled()
    })
    fetchSpy.mockRestore()
  })
})
