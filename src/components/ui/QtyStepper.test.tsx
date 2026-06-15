import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QtyStepper } from './QtyStepper'

describe('QtyStepper', () => {
  it('預設 min=1、value=1 時「-」disabled、「+」enabled', () => {
    render(<QtyStepper value={1} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '減少數量' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加數量' })).toBeEnabled()
  })

  it('value=50（兩鈕都 enabled）→ 點「-」/「+」分別觸發 onChange(49)/onChange(51)', async () => {
    const onChange = vi.fn()
    render(<QtyStepper value={50} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '減少數量' }))
    await userEvent.click(screen.getByRole('button', { name: '增加數量' }))
    expect(onChange).toHaveBeenNthCalledWith(1, 49)
    expect(onChange).toHaveBeenNthCalledWith(2, 51)
  })

  it('預設 max=99、value=99 時「+」disabled', () => {
    render(<QtyStepper value={99} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '增加數量' })).toBeDisabled()
  })

  it('自訂 min=3、value=3 時「-」disabled', () => {
    render(<QtyStepper value={3} min={3} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '減少數量' })).toBeDisabled()
  })

  it('自訂 max=5、value=5 時「+」disabled', () => {
    render(<QtyStepper value={5} max={5} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '增加數量' })).toBeDisabled()
  })

  it('value 顯示為 tabular-nums + min-w（避免抖動）', () => {
    render(<QtyStepper value={7} onChange={() => {}} />)
    const span = screen.getByText('7')
    expect(span.tagName).toBe('SPAN')
    expect(span.className).toMatch(/tabular-nums/)
  })

  it('clamp：min=1 時點「-」不會 onChange(0)（disabled gate 雙保險）', async () => {
    const onChange = vi.fn()
    render(<QtyStepper value={1} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '減少數量' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
