import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfirmPanel } from './ConfirmPanel'

describe('ConfirmPanel', () => {
  it('有 title → 渲染 h2 置中', () => {
    render(
      <ConfirmPanel title="捐款明細">
        <p>body</p>
      </ConfirmPanel>,
    )
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2).toHaveTextContent('捐款明細')
    expect(h2.className).toMatch(/text-center/)
  })

  it('無 title → 不渲染 h2', () => {
    const { container } = render(
      <ConfirmPanel>
        <p>body</p>
      </ConfirmPanel>,
    )
    expect(container.querySelector('h2')).toBeNull()
  })

  it('variant=first → className 含 -mt-6（蓋紅 hero）+ relative z-10', () => {
    const { container } = render(
      <ConfirmPanel variant="first">body</ConfirmPanel>,
    )
    const section = container.querySelector('section') as HTMLElement
    expect(section.className).toMatch(/-mt-6/)
    expect(section.className).toMatch(/z-10/)
  })

  it('variant=normal（預設）→ className 不含 -mt-6', () => {
    const { container } = render(<ConfirmPanel>body</ConfirmPanel>)
    const section = container.querySelector('section') as HTMLElement
    expect(section.className).not.toMatch(/-mt-6/)
  })

  it('用 <section> semantic + rounded-2xl 白卡', () => {
    const { container } = render(<ConfirmPanel>body</ConfirmPanel>)
    const section = container.querySelector('section') as HTMLElement
    expect(section).toBeTruthy()
    expect(section.className).toMatch(/bg-surface-card/)
    expect(section.className).toMatch(/rounded-2xl/)
  })
})
