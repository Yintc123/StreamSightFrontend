import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfoDialog } from './InfoDialog'

describe('InfoDialog', () => {
  it('1: open=false → 不渲染 dialog（不污染 DOM）', () => {
    render(
      <InfoDialog open={false} onClose={() => {}} title="hi">
        body
      </InfoDialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('2: open=true → 渲染 role=dialog + aria-modal + title + body', () => {
    render(
      <InfoDialog open onClose={() => {}} title="什麼是匿名捐款？">
        body 文字
      </InfoDialog>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('什麼是匿名捐款？')).toBeInTheDocument()
    expect(screen.getByText('body 文字')).toBeInTheDocument()
  })

  it('3: 按 ESC → onClose 被叫 1 次', async () => {
    const onClose = vi.fn()
    render(
      <InfoDialog open onClose={onClose} title="x">
        y
      </InfoDialog>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('4: 點 scrim → onClose 被叫；點 panel 內部 → 不叫', async () => {
    const onClose = vi.fn()
    render(
      <InfoDialog open onClose={onClose} title="x">
        body 文字
      </InfoDialog>,
    )
    // 點 panel 內部 (title) → 不該 close
    await userEvent.click(screen.getByText('body 文字'))
    expect(onClose).not.toHaveBeenCalled()
    // 點 scrim (role=presentation) → 該 close
    const scrim = screen.getByRole('dialog').parentElement!
    await userEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('5: 點 dismiss button → onClose 被叫 1 次', async () => {
    const onClose = vi.fn()
    render(
      <InfoDialog open onClose={onClose} title="x">
        y
      </InfoDialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: '我知道了' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('6: dismissLabel prop → button 文字跟著變', () => {
    render(
      <InfoDialog open onClose={() => {}} title="x" dismissLabel="OK">
        y
      </InfoDialog>,
    )
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('7: open 時 dismiss button 自動取得焦點', () => {
    render(
      <InfoDialog open onClose={() => {}} title="x">
        y
      </InfoDialog>,
    )
    expect(screen.getByRole('button', { name: '我知道了' })).toHaveFocus()
  })
})
