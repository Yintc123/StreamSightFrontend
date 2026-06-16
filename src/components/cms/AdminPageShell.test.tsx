import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/cms/charities',
}))

import { AdminPageShell } from './AdminPageShell'

describe('AdminPageShell', () => {
  it('1: 渲染 TopNav title + children + 無 actions 不渲染 sticky bar', () => {
    render(
      <AdminPageShell title="公益團體" backHref="/cms">
        <p>content</p>
      </AdminPageShell>,
    )
    expect(screen.getByRole('heading', { name: '公益團體' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立' })).toBeNull()
  })

  it('2: actions 有 + onSubmit 有 → form wrap + sticky bar 顯示', () => {
    const onSubmit = vi.fn()
    render(
      <AdminPageShell
        title="新增"
        backHref="/cms/charities"
        onSubmit={onSubmit}
        actions={
          <button type="submit" name="submit">
            建立
          </button>
        }
      >
        <input id="name" />
      </AdminPageShell>,
    )
    expect(screen.getByRole('button', { name: '建立' })).toBeInTheDocument()
  })

  it('3: 點 submit button → onSubmit 被叫', async () => {
    const onSubmit = vi.fn()
    render(
      <AdminPageShell
        title="新增"
        backHref="/cms/charities"
        onSubmit={onSubmit}
        actions={<button type="submit">建立</button>}
      >
        <input id="name" />
      </AdminPageShell>,
    )
    await userEvent.click(screen.getByRole('button', { name: '建立' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('4: TopNav backHref prop 傳遞', () => {
    render(
      <AdminPageShell title="新增" backHref="/cms/charities">
        <p>x</p>
      </AdminPageShell>,
    )
    // TopNav 是 sticky header；只要 backHref 對應的 button 存在即可
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
  })
})
