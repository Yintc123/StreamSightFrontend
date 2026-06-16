import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormField } from './FormField'

describe('FormField', () => {
  it('1: required=true → 含紅星 + sr-only「必填」', () => {
    render(
      <FormField id="x" label="名稱" required>
        <input id="x" />
      </FormField>,
    )
    expect(screen.getByText('必填')).toHaveClass('sr-only')
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden')
  })

  it('2: error 給字串 → 渲染 role=alert + 文字', () => {
    render(
      <FormField id="x" label="名稱" error="必填欄位">
        <input id="x" />
      </FormField>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('必填欄位')
  })

  it('3: error 給 undefined → 不渲染 alert', () => {
    render(
      <FormField id="x" label="名稱">
        <input id="x" />
      </FormField>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('4: hint 有 → 渲染 hint 段落', () => {
    render(
      <FormField id="x" label="名稱" hint="最多 120 字">
        <input id="x" />
      </FormField>,
    )
    expect(screen.getByText('最多 120 字')).toBeInTheDocument()
  })

  it('5: htmlFor 對應 label，id 對應 input', () => {
    render(
      <FormField id="my-field" label="名稱">
        <input id="my-field" />
      </FormField>,
    )
    const label = screen.getByText('名稱').closest('label')!
    expect(label).toHaveAttribute('for', 'my-field')
  })
})
