import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExpandableText } from './ExpandableText'

const SHORT = '短文不需要展開。'
const LONG =
  '當你長大時,你會發現你有兩隻手,一隻用來幫助自己,一隻用來幫助別人。' +
  '『關懷長養、幫助弱小』本來就是每個人天性的一部份!就算是再十惡不赦的人,也會有惻隱之心。'

describe('ExpandableText', () => {
  it('text < threshold → 只渲染文字、不渲染「更多」按鈕', () => {
    render(<ExpandableText text={SHORT} threshold={100} />)
    expect(screen.getByText(SHORT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /更多|收起/ })).toBeNull()
  })

  it('text ≥ threshold → 渲染文字 + 「更多」按鈕、預設 collapsed', () => {
    render(<ExpandableText text={LONG} threshold={50} />)
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument()
  })

  it('預設 collapsed：<p> 帶 line-clamp-3 class', () => {
    const { container } = render(<ExpandableText text={LONG} threshold={50} />)
    const p = container.querySelector('p')!
    expect(p.className).toMatch(/line-clamp-3/)
  })

  it('點「更多」→ 展開、<p> 拿掉 line-clamp、按鈕變「收起」', () => {
    const { container } = render(<ExpandableText text={LONG} threshold={50} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    expect(container.querySelector('p')?.className).not.toMatch(/line-clamp-3/)
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
  })

  it('點「收起」→ 收回、按鈕變「更多」', () => {
    render(<ExpandableText text={LONG} threshold={50} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument()
  })

  it('text 剛好 threshold → 不顯示「更多」（門檻是嚴格大於）', () => {
    const exactly = 'x'.repeat(100)
    render(<ExpandableText text={exactly} threshold={100} />)
    expect(screen.queryByRole('button', { name: /更多|收起/ })).toBeNull()
  })

  it('預設 threshold = 100', () => {
    const longerThan100 = 'x'.repeat(101)
    render(<ExpandableText text={longerThan100} />)
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument()
  })
})
