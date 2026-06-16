import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('1: 渲染 <textarea> + value', () => {
    render(<Textarea id="x" value="hello" onChange={() => {}} />)
    const el = screen.getByDisplayValue('hello')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('2: rows prop 套到 element（預設 4）', () => {
    render(<Textarea id="x" value="" onChange={() => {}} />)
    expect(document.getElementById('x')).toHaveAttribute('rows', '4')
  })

  it('3: 打字 → onChange', async () => {
    const onChange = vi.fn()
    render(<Textarea id="x" value="" onChange={onChange} />)
    await userEvent.type(document.getElementById('x')!, 'h')
    expect(onChange).toHaveBeenCalledWith('h')
  })

  it('4: ariaInvalid → aria-invalid + className 含 aria-invalid:border-brand', () => {
    render(<Textarea id="x" value="" onChange={() => {}} ariaInvalid />)
    const el = document.getElementById('x')!
    expect(el).toHaveAttribute('aria-invalid', 'true')
    expect(el.className).toMatch(/aria-invalid:border-brand/)
  })
})
