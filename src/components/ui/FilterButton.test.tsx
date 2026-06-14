import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterButton } from './FilterButton'

describe('FilterButton', () => {
  it('渲染 label', () => {
    render(<FilterButton label="全部" onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('全部')
  })

  it('caret icon 存在且 aria-hidden', () => {
    const { container } = render(<FilterButton label="全部" onClick={() => {}} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg).toHaveAttribute('aria-hidden')
  })

  it('點擊觸發 onClick', async () => {
    const onClick = vi.fn()
    render(<FilterButton label="全部" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aria-label 為「篩選：{label}」', () => {
    render(<FilterButton label="動物保護" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: '篩選：動物保護' })).toBeInTheDocument()
  })

  it('aria-haspopup="dialog"（對齊 003m role="dialog"）', () => {
    render(<FilterButton label="全部" onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('isOpen=false → aria-expanded=false、caret 無 rotate-180', () => {
    const { container } = render(<FilterButton label="全部" onClick={() => {}} isOpen={false} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    const svg = container.querySelector('svg')
    expect(svg?.className.baseVal ?? svg?.getAttribute('class') ?? '').not.toMatch(/rotate-180/)
  })

  it('isOpen=true → aria-expanded=true、caret 有 rotate-180', () => {
    const { container } = render(<FilterButton label="全部" onClick={() => {}} isOpen={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    const svg = container.querySelector('svg')
    const cls = svg?.className.baseVal ?? svg?.getAttribute('class') ?? ''
    expect(cls).toMatch(/rotate-180/)
  })

  it('label span 為 font-bold + whitespace-nowrap（同一行、粗體）', () => {
    render(<FilterButton label="教育議題提倡" onClick={() => {}} />)
    const labelSpan = screen.getByText('教育議題提倡')
    expect(labelSpan.tagName).toBe('SPAN')
    expect(labelSpan.className).toMatch(/font-bold/)
    expect(labelSpan.className).toMatch(/whitespace-nowrap/)
  })
})
