import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input', () => {
  it('1: 渲染 type=text + value', () => {
    render(<Input id="x" value="hello" onChange={() => {}} />)
    const el = screen.getByDisplayValue('hello') as HTMLInputElement
    expect(el.type).toBe('text')
  })

  it('2: type prop 套到 element', () => {
    render(<Input id="x" type="email" value="" onChange={() => {}} />)
    const el = document.getElementById('x') as HTMLInputElement
    expect(el.type).toBe('email')
  })

  it('3: 打字 → onChange(value)', async () => {
    const onChange = vi.fn()
    render(<Input id="x" value="" onChange={onChange} />)
    await userEvent.type(document.getElementById('x')!, 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('4: maxLength + aria-invalid + aria-describedby 套到 element', () => {
    render(
      <Input
        id="x"
        value=""
        onChange={() => {}}
        maxLength={10}
        ariaInvalid
        ariaDescribedBy="x-error"
      />,
    )
    const el = document.getElementById('x') as HTMLInputElement
    expect(el.maxLength).toBe(10)
    expect(el).toHaveAttribute('aria-invalid', 'true')
    expect(el).toHaveAttribute('aria-describedby', 'x-error')
  })

  it('5: ariaInvalid → className 含 aria-invalid:border-brand', () => {
    render(<Input id="x" value="" onChange={() => {}} ariaInvalid />)
    expect(document.getElementById('x')!.className).toMatch(/aria-invalid:border-brand/)
  })
})
