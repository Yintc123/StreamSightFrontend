import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisclaimerBox, DISCLAIMER_PLATFORM } from './DisclaimerBox'

describe('DisclaimerBox', () => {
  it('渲染 children 在 <p> semantic 內', () => {
    render(<DisclaimerBox>提醒一句</DisclaimerBox>)
    const p = screen.getByText('提醒一句')
    expect(p.tagName).toBe('P')
  })

  it('套灰底 className（bg-black/5）', () => {
    render(<DisclaimerBox>x</DisclaimerBox>)
    expect(screen.getByText('x').className).toMatch(/bg-black\/5/)
  })

  it('className prop 合併到 <p>', () => {
    render(<DisclaimerBox className="mb-4">x</DisclaimerBox>)
    expect(screen.getByText('x').className).toMatch(/mb-4/)
  })

  it('DISCLAIMER_PLATFORM 為非空字串', () => {
    expect(typeof DISCLAIMER_PLATFORM).toBe('string')
    expect(DISCLAIMER_PLATFORM.length).toBeGreaterThan(0)
  })
})
