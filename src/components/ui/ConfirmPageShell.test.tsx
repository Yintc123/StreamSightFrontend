import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmPageShell } from './ConfirmPageShell'

// 避免 TopNav 內部用 next/navigation router 抱怨
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/checkout/donation',
}))

describe('ConfirmPageShell', () => {
  it('渲染 TopNav title + 紅 hero + form + children + sticky CTA', () => {
    const { container } = render(
      <ConfirmPageShell
        title="確認捐款資訊"
        ctaLabel="確認送出"
        isValid
        onSubmit={() => {}}
      >
        <div data-testid="panel">panel content</div>
      </ConfirmPageShell>,
    )
    // TopNav 標題
    expect(screen.getByRole('heading', { name: '確認捐款資訊' })).toBeInTheDocument()
    // 紅 hero（aria-hidden 裝飾條）
    expect(container.querySelector('[aria-hidden].bg-brand')).not.toBeNull()
    // form 包外殼
    expect(container.querySelector('form')).not.toBeNull()
    // children
    expect(screen.getByTestId('panel')).toBeInTheDocument()
    // sticky CTA 按鈕
    expect(screen.getByRole('button', { name: '確認送出' })).toBeInTheDocument()
  })

  it('isValid=false → sticky CTA disabled', () => {
    render(
      <ConfirmPageShell
        title="t"
        ctaLabel="送出"
        isValid={false}
        onSubmit={() => {}}
      >
        <p />
      </ConfirmPageShell>,
    )
    expect(screen.getByRole('button', { name: '送出' })).toBeDisabled()
  })

  it('點 sticky button → onSubmit 觸發（透過 form submit event）', async () => {
    const onSubmit = vi.fn()
    render(
      <ConfirmPageShell title="t" ctaLabel="送出" isValid onSubmit={onSubmit}>
        <p />
      </ConfirmPageShell>,
    )
    await userEvent.click(screen.getByRole('button', { name: '送出' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('在 children 內 input 按 Enter → onSubmit 觸發（form semantic）', async () => {
    const onSubmit = vi.fn()
    render(
      <ConfirmPageShell title="t" ctaLabel="送出" isValid onSubmit={onSubmit}>
        <input data-testid="inp" />
      </ConfirmPageShell>,
    )
    const input = screen.getByTestId('inp')
    input.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('form 不觸發 default browser navigation（preventDefault）', () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <ConfirmPageShell title="t" ctaLabel="送出" isValid onSubmit={onSubmit}>
        <p />
      </ConfirmPageShell>,
    )
    const form = container.querySelector('form')!
    const evt = new Event('submit', { bubbles: true, cancelable: true })
    fireEvent(form, evt)
    expect(evt.defaultPrevented).toBe(true)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
