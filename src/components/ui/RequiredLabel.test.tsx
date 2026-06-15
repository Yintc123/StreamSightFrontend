import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequiredLabel } from './RequiredLabel'

describe('RequiredLabel', () => {
  it('渲染 label 文字 + 紅星（aria-hidden）+ sr-only「必填」', () => {
    render(<RequiredLabel htmlFor="x">捐款人姓名</RequiredLabel>)
    const label = screen.getByText('捐款人姓名').closest('label')
    expect(label).not.toBeNull()
    expect(label?.tagName).toBe('LABEL')

    const star = label!.querySelector('[aria-hidden]')
    expect(star?.textContent).toBe('*')
    expect(star?.className).toMatch(/text-brand/)

    expect(screen.getByText('必填')).toHaveClass('sr-only')
  })

  it('htmlFor 設定 <label for=>', () => {
    render(<RequiredLabel htmlFor="donorName">姓名</RequiredLabel>)
    const label = screen.getByText('姓名').closest('label')
    expect(label?.getAttribute('for')).toBe('donorName')
  })

  it('className 合併到 label 上', () => {
    render(<RequiredLabel htmlFor="x" className="mb-2">收據</RequiredLabel>)
    const label = screen.getByText('收據').closest('label')
    expect(label?.className).toMatch(/mb-2/)
  })
})
