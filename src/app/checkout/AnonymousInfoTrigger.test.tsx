import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AnonymousInfoTrigger,
  ANONYMOUS_INFO_TITLE,
  ANONYMOUS_INFO_BODY,
} from './AnonymousInfoTrigger'

describe('AnonymousInfoTrigger', () => {
  it('1: 預設只渲染 trigger button（含 aria-label）、無 dialog', () => {
    render(<AnonymousInfoTrigger />)
    expect(
      screen.getByRole('button', { name: ANONYMOUS_INFO_TITLE }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('2: 點 trigger → dialog 出現、title + body 顯示', async () => {
    render(<AnonymousInfoTrigger />)
    await userEvent.click(
      screen.getByRole('button', { name: ANONYMOUS_INFO_TITLE }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(ANONYMOUS_INFO_BODY)).toBeInTheDocument()
  })

  it('3: open 時 aria-expanded="true"；close 後回 "false"', async () => {
    render(<AnonymousInfoTrigger />)
    const trigger = screen.getByRole('button', { name: ANONYMOUS_INFO_TITLE })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: '我知道了' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('4: 點 dismiss → dialog 消失、焦點回 trigger button', async () => {
    render(<AnonymousInfoTrigger />)
    const trigger = screen.getByRole('button', { name: ANONYMOUS_INFO_TITLE })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: '我知道了' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('5: 文案 const 為非空字串', () => {
    expect(typeof ANONYMOUS_INFO_TITLE).toBe('string')
    expect(ANONYMOUS_INFO_TITLE.length).toBeGreaterThan(0)
    expect(typeof ANONYMOUS_INFO_BODY).toBe('string')
    expect(ANONYMOUS_INFO_BODY.length).toBeGreaterThan(0)
  })
})
