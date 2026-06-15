import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StickyConfirmCta } from './StickyConfirmCta'

describe('StickyConfirmCta', () => {
  it('isValid=true → button enabled、label 顯示', () => {
    render(<StickyConfirmCta label="確認送出" isValid />)
    const btn = screen.getByRole('button', { name: '確認送出' })
    expect(btn).toBeEnabled()
  })

  it('isValid=false → button disabled、含 disabled className', () => {
    render(<StickyConfirmCta label="確認送出" isValid={false} />)
    const btn = screen.getByRole('button', { name: '確認送出' })
    expect(btn).toBeDisabled()
    expect(btn.className).toMatch(/disabled:bg-black\/10/)
  })

  it('button type=submit（不是 button）', () => {
    render(<StickyConfirmCta label="送出" isValid />)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('wrapper 套 sticky bottom-0 + z-30 + safe-area padding', () => {
    const { container } = render(<StickyConfirmCta label="送出" isValid />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/sticky/)
    expect(wrapper.className).toMatch(/bottom-0/)
    expect(wrapper.className).toMatch(/z-30/)
    expect(wrapper.className).toMatch(/safe-area-inset-bottom/)
  })
})
